import { Given, Then, Before, After, World, defineStep, When } from '@cucumber/cucumber'
import { expect } from 'chai'
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import {
  MemoryStore,
  SqliteStore,
  createBudget,
  createAccount,
  createCategoryGroup,
  createCategory,
  addTransaction,
  createPayee,
  type Store,
  type Budget,
  type Account,
  type CategoryGroup,
  type Category,
} from '@budget/core'
import { setStore, resetStore, saveStore } from '../../src/store.ts'
import {
  setActiveBudgetId,
  clearActiveBudgetId,
  setCurrentDbPath,
  resetCurrentDbPath,
} from '../../src/config.ts'

// Test config directory for file-based store tests
const TEST_CONFIG_DIR = '/tmp/budget-feature-test-config'

// World context for sharing state between steps
interface TestWorld extends World {
  store: Store
  output: string
  exitCode: number
  capturedId: string
  budgets: Map<string, Budget>
  accounts: Map<string, Account>
  groups: Map<string, CategoryGroup>
  categories: Map<string, Category>
  lastTransactionId: string
  dbPath?: string
  usedDbPaths: string[]
}

Before(function (this: TestWorld) {
  this.budgets = new Map()
  this.accounts = new Map()
  this.groups = new Map()
  this.categories = new Map()
  this.output = ''
  this.exitCode = 0
  this.capturedId = ''
  this.lastTransactionId = ''
  this.usedDbPaths = []

  // Set up test config directory
  process.env.BUDGET_CONFIG_DIR = TEST_CONFIG_DIR
  if (!existsSync(TEST_CONFIG_DIR)) {
    mkdirSync(TEST_CONFIG_DIR, { recursive: true })
  }
})

After(function (this: TestWorld) {
  resetStore()
  clearActiveBudgetId()

  // Clean up test database files
  for (const dbPath of this.usedDbPaths || []) {
    if (existsSync(dbPath)) {
      rmSync(dbPath, { force: true })
    }
  }

  // Clean up test config directory
  if (existsSync(TEST_CONFIG_DIR)) {
    rmSync(TEST_CONFIG_DIR, { recursive: true, force: true })
  }
})

// Store setup
Given('I am using an in-memory store', function (this: TestWorld) {
  this.store = new MemoryStore()
  setStore(this.store)
})

// File-based store for config isolation tests
Given(
  'I am using a file-based store at {string}',
  async function (this: TestWorld, dbPath: string) {
    // Save current store before switching
    if (this.store && this.dbPath) {
      const sqliteStore = this.store as SqliteStore
      if (typeof sqliteStore.export === 'function') {
        const data = sqliteStore.export()
        writeFileSync(this.dbPath, Buffer.from(data))
      }
    }

    // Track for cleanup
    if (!this.usedDbPaths.includes(dbPath)) {
      this.usedDbPaths.push(dbPath)
    }
    this.dbPath = dbPath

    // Close existing store if any
    resetStore()

    // Set the current database path for config isolation
    setCurrentDbPath(dbPath)

    // Load existing data if file exists, or create new database
    if (existsSync(dbPath)) {
      const data = readFileSync(dbPath)
      this.store = await SqliteStore.create(data)
    } else {
      this.store = await SqliteStore.create()
      // Save immediately to create the file
      const sqliteStore = this.store as SqliteStore
      const data = sqliteStore.export()
      writeFileSync(dbPath, Buffer.from(data))
    }

    setStore(this.store)
  }
)

// Reset store and config for simulating new session
When('I reset the store and config', function (this: TestWorld) {
  // Save current store before resetting
  if (this.store && this.dbPath) {
    const sqliteStore = this.store as SqliteStore
    const data = sqliteStore.export()
    writeFileSync(this.dbPath, Buffer.from(data))
  }
  resetStore()
  // Note: We don't clear config - the active budget should persist in config file
})

// Budget setup
Given('a budget named {string} exists', function (this: TestWorld, name: string) {
  const budget = createBudget({ name })
  this.store.saveBudget(budget)
  this.budgets.set(name, budget)
})

Given('{string} is the active budget', function (this: TestWorld, name: string) {
  const budget = this.budgets.get(name)
  if (!budget) {
    throw new Error(`Budget "${name}" not found`)
  }
  setActiveBudgetId(budget.id)
})

Given('I capture the budget ID for {string}', function (this: TestWorld, name: string) {
  const budget = this.budgets.get(name)
  if (!budget) {
    throw new Error(`Budget "${name}" not found`)
  }
  this.capturedId = budget.id
})

// Account setup
Given(
  'an account named {string} of type {string} exists',
  function (this: TestWorld, name: string, type: string) {
    const activeBudget = [...this.budgets.values()][0]
    if (!activeBudget) {
      throw new Error('No budget exists')
    }
    const account = createAccount({
      budgetId: activeBudget.id,
      name,
      type: type as 'checking' | 'savings' | 'credit' | 'cash' | 'tracking',
    })
    this.store.saveAccount(account)
    this.accounts.set(name, account)
  }
)

Given('I capture the account ID for {string}', function (this: TestWorld, name: string) {
  const account = this.accounts.get(name)
  if (!account) {
    throw new Error(`Account "${name}" not found`)
  }
  this.capturedId = account.id
})

// Category group setup
Given('a category group named {string} exists', function (this: TestWorld, name: string) {
  const activeBudget = [...this.budgets.values()][0]
  if (!activeBudget) {
    throw new Error('No budget exists')
  }
  const group = createCategoryGroup({
    budgetId: activeBudget.id,
    name,
  })
  this.store.saveCategoryGroup(group)
  this.groups.set(name, group)
})

Given('I capture the group ID for {string}', function (this: TestWorld, name: string) {
  const group = this.groups.get(name)
  if (!group) {
    throw new Error(`Group "${name}" not found`)
  }
  this.capturedId = group.id
})

// Category setup
Given(
  'a category named {string} in group {string} exists',
  function (this: TestWorld, categoryName: string, groupName: string) {
    const group = this.groups.get(groupName)
    if (!group) {
      throw new Error(`Group "${groupName}" not found`)
    }
    const category = createCategory({
      groupId: group.id,
      name: categoryName,
    })
    this.store.saveCategory(category)
    this.categories.set(categoryName, category)
  }
)

Given('I capture the category ID for {string}', function (this: TestWorld, name: string) {
  const category = this.categories.get(name)
  if (!category) {
    throw new Error(`Category "${name}" not found`)
  }
  this.capturedId = category.id
})

// Transaction setup
Given(
  'a transaction of ${int} in {string} from {string}',
  function (this: TestWorld, amount: number, accountName: string, payeeName: string) {
    const account = this.accounts.get(accountName)
    if (!account) {
      throw new Error(`Account "${accountName}" not found`)
    }
    const activeBudget = [...this.budgets.values()][0]
    const payee = createPayee({ budgetId: activeBudget.id, name: payeeName })
    this.store.savePayee(payee)

    const txn = addTransaction(this.store, {
      accountId: account.id,
      amount: amount * 100, // Convert to cents
      date: new Date().toISOString().split('T')[0],
      payeeId: payee.id,
    })
    this.lastTransactionId = txn.id
  }
)

Given(
  'a transaction of -${int} in {string} from {string}',
  function (this: TestWorld, amount: number, accountName: string, payeeName: string) {
    const account = this.accounts.get(accountName)
    if (!account) {
      throw new Error(`Account "${accountName}" not found`)
    }
    const activeBudget = [...this.budgets.values()][0]
    const payee = createPayee({ budgetId: activeBudget.id, name: payeeName })
    this.store.savePayee(payee)

    const txn = addTransaction(this.store, {
      accountId: account.id,
      amount: -amount * 100, // Negative and convert to cents
      date: new Date().toISOString().split('T')[0],
      payeeId: payee.id,
    })
    this.lastTransactionId = txn.id
  }
)

Given(
  'a transaction of -${int} in {string} from {string} for category {string}',
  function (
    this: TestWorld,
    amount: number,
    accountName: string,
    payeeName: string,
    categoryName: string
  ) {
    const account = this.accounts.get(accountName)
    if (!account) {
      throw new Error(`Account "${accountName}" not found`)
    }
    const category = this.categories.get(categoryName)
    if (!category) {
      throw new Error(`Category "${categoryName}" not found`)
    }
    const activeBudget = [...this.budgets.values()][0]
    const payee = createPayee({ budgetId: activeBudget.id, name: payeeName })
    this.store.savePayee(payee)

    const txn = addTransaction(this.store, {
      accountId: account.id,
      amount: -amount * 100,
      date: new Date().toISOString().split('T')[0],
      payeeId: payee.id,
      categoryId: category.id,
    })
    this.lastTransactionId = txn.id
  }
)

Given('I capture the last transaction ID', function (this: TestWorld) {
  this.capturedId = this.lastTransactionId
})

// Transaction with date (for carryover testing)
Given(
  'a transaction of ${int} in {string} from {string} on {string}',
  function (this: TestWorld, amount: number, accountName: string, payeeName: string, date: string) {
    const account = this.accounts.get(accountName)
    if (!account) {
      throw new Error(`Account "${accountName}" not found`)
    }
    const activeBudget = [...this.budgets.values()][0]
    const payee = createPayee({ budgetId: activeBudget.id, name: payeeName })
    this.store.savePayee(payee)

    const txn = addTransaction(this.store, {
      accountId: account.id,
      amount: amount * 100, // Convert to cents
      date,
      payeeId: payee.id,
    })
    this.lastTransactionId = txn.id
  }
)

Given(
  'a transaction of -${int} in {string} from {string} for category {string} on {string}',
  function (
    this: TestWorld,
    amount: number,
    accountName: string,
    payeeName: string,
    categoryName: string,
    date: string
  ) {
    const account = this.accounts.get(accountName)
    if (!account) {
      throw new Error(`Account "${accountName}" not found`)
    }
    const category = this.categories.get(categoryName)
    if (!category) {
      throw new Error(`Category "${categoryName}" not found`)
    }
    const activeBudget = [...this.budgets.values()][0]
    const payee = createPayee({ budgetId: activeBudget.id, name: payeeName })
    this.store.savePayee(payee)

    const txn = addTransaction(this.store, {
      accountId: account.id,
      amount: -amount * 100,
      date,
      payeeId: payee.id,
      categoryId: category.id,
    })
    this.lastTransactionId = txn.id
  }
)

// Command execution - defined once, used by both When and Given contexts
defineStep('I run {string}', async function (this: TestWorld, command: string) {
  const resolvedCommand = command.replace('<captured-id>', this.capturedId)
  const { runCommand } = await import('./command-runner.ts')
  const result = await runCommand(resolvedCommand, this.store)
  this.output = result.output
  this.exitCode = result.exitCode
})

// Assertions
Then('the command should succeed', function (this: TestWorld) {
  expect(this.exitCode, `Command failed with output: ${this.output}`).to.equal(0)
})

Then('the command should fail', function (this: TestWorld) {
  expect(this.exitCode).to.not.equal(0)
})

Then('the output should contain {string}', function (this: TestWorld, expected: string) {
  expect(this.output).to.include(expected)
})

Then('the output should not contain {string}', function (this: TestWorld, expected: string) {
  expect(this.output).to.not.include(expected)
})

Then('the output should be valid JSON', function (this: TestWorld) {
  try {
    JSON.parse(this.output)
  } catch {
    throw new Error(`Output is not valid JSON: ${this.output}`)
  }
})

Then('the JSON should contain {string}', function (this: TestWorld, expected: string) {
  const json = JSON.parse(this.output)
  const stringified = JSON.stringify(json)
  expect(stringified).to.include(expected)
})

Then('the output should be a UUID', function (this: TestWorld) {
  const lines = this.output.trim().split('\n')
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  for (const line of lines) {
    if (line.trim()) {
      expect(line.trim()).to.match(uuidRegex)
    }
  }
})

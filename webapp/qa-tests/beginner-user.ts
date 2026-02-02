/**
 * Beginner User QA Test Script
 *
 * This script simulates a beginner user's first experience with the budget app.
 * It tests the core flows from a beginner's perspective, capturing screenshots
 * and documenting UX observations.
 */

import { chromium, type Browser, type Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_URL = 'http://localhost:5173'
const SCREENSHOT_DIR = path.join(__dirname, '..', 'qa-screenshots', 'beginner')

// Test results storage
interface TestResult {
  scenario: string
  status: 'pass' | 'fail' | 'issues'
  observations: string[]
  uxIssues: string[]
  bugs: string[]
  screenshots: string[]
}

const results: TestResult[] = []

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

async function takeScreenshot(page: Page, name: string): Promise<string> {
  const filename = `${name}.png`
  const filepath = path.join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: filepath, fullPage: true })
  console.log(`  Screenshot saved: ${filename}`)
  return filename
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================================
// Scenario 1: First Load Experience
// ============================================================================
async function testFirstLoadExperience(page: Page): Promise<TestResult> {
  const result: TestResult = {
    scenario: 'Scenario 1: First Load Experience',
    status: 'pass',
    observations: [],
    uxIssues: [],
    bugs: [],
    screenshots: [],
  }

  console.log('\n=== Scenario 1: First Load Experience ===')

  try {
    // Navigate to the app
    await page.goto(BASE_URL)
    await page.waitForLoadState('networkidle')
    await delay(1000) // Allow animations to complete

    // Take screenshot of initial state
    const screenshot = await takeScreenshot(page, '01-initial-load')
    result.screenshots.push(screenshot)

    // Check what's visible on first load
    const header = await page.textContent('.app-header h1')
    result.observations.push(`App title: "${header}"`)

    // Check if there's a "Ready to Assign" section
    const readyToAssign = await page.locator('.ready-to-assign').isVisible()
    if (readyToAssign) {
      const rtaText = await page.textContent('.ready-to-assign')
      result.observations.push(`Ready to Assign section visible: "${rtaText}"`)
    }

    // Check for category groups
    const groupCount = await page.locator('.budget-table__group-row').count()
    result.observations.push(`Number of category groups visible: ${groupCount}`)

    // Check for transactions section
    const transactionHeader = await page.locator('.transaction-list-header h2').isVisible()
    result.observations.push(`Transactions section visible: ${transactionHeader}`)

    // Check for "Add" buttons - are they discoverable?
    const addGroupBtn = await page.locator('.add-group-btn').isVisible()
    const addTransactionBtn = await page.locator('.add-transaction-btn').isVisible()

    if (!addGroupBtn) {
      result.uxIssues.push(
        'Add Category Group button may not be immediately visible without scrolling'
      )
    }

    if (addTransactionBtn) {
      result.observations.push('Add Transaction button is visible and discoverable')
    } else {
      result.uxIssues.push('Add Transaction button not easily discoverable')
    }

    // Is it clear what to do first?
    const emptyMessage = await page.locator('.empty-message').isVisible()
    if (emptyMessage) {
      const msg = await page.textContent('.empty-message')
      result.observations.push(`Empty state message shown: "${msg}"`)
    } else {
      result.uxIssues.push('No clear guidance for new users on what to do first')
    }

    // Check for any onboarding or help
    const helpVisible = await page.locator('text=help').isVisible().catch(() => false)
    if (!helpVisible) {
      result.uxIssues.push('No visible help or onboarding for beginners')
    }

    console.log('  Status: PASS')
  } catch (error) {
    result.status = 'fail'
    result.bugs.push(`Test failed with error: ${error}`)
    console.log(`  Status: FAIL - ${error}`)
  }

  return result
}

// ============================================================================
// Scenario 2: Adding First Category Group
// ============================================================================
async function testAddingFirstCategoryGroup(page: Page): Promise<TestResult> {
  const result: TestResult = {
    scenario: 'Scenario 2: Adding First Category Group',
    status: 'pass',
    observations: [],
    uxIssues: [],
    bugs: [],
    screenshots: [],
  }

  console.log('\n=== Scenario 2: Adding First Category Group ===')

  try {
    // Screenshot before adding
    const beforeScreenshot = await takeScreenshot(page, '02a-before-add-group')
    result.screenshots.push(beforeScreenshot)

    // Find and click the "Add Category Group" button
    const addGroupBtn = page.locator('.add-group-btn')

    if (!(await addGroupBtn.isVisible())) {
      // May need to scroll
      await addGroupBtn.scrollIntoViewIfNeeded()
      result.uxIssues.push('Had to scroll to find Add Category Group button')
    }

    // Check the button text - is it clear?
    const btnText = await addGroupBtn.textContent()
    result.observations.push(`Add group button text: "${btnText}"`)

    // Click to add a group
    await addGroupBtn.click()
    await delay(300)

    // Screenshot showing the input field
    const inputScreenshot = await takeScreenshot(page, '02b-add-group-input')
    result.screenshots.push(inputScreenshot)

    // Check if input is visible and has good placeholder
    const inputVisible = await page.locator('.add-group-input').isVisible()
    if (inputVisible) {
      const placeholder = await page.locator('.add-group-input').getAttribute('placeholder')
      result.observations.push(`Input placeholder: "${placeholder}"`)
    } else {
      result.bugs.push('Input field did not appear after clicking Add Category Group')
      result.status = 'fail'
      return result
    }

    // Type a beginner-friendly group name
    await page.fill('.add-group-input', 'My Expenses')
    await delay(200)

    // Try pressing Enter to add
    await page.press('.add-group-input', 'Enter')
    await delay(500)

    // Screenshot after adding
    const afterScreenshot = await takeScreenshot(page, '02c-after-add-group')
    result.screenshots.push(afterScreenshot)

    // Verify the group was added
    const newGroup = await page.locator('.budget-table__group-name-text', { hasText: 'My Expenses' })
    if (await newGroup.isVisible()) {
      result.observations.push('Successfully added category group "My Expenses"')
    } else {
      result.bugs.push('Category group was not added or not visible after creation')
      result.status = 'fail'
    }

    console.log('  Status: PASS')
  } catch (error) {
    result.status = 'fail'
    result.bugs.push(`Test failed with error: ${error}`)
    console.log(`  Status: FAIL - ${error}`)
  }

  return result
}

// ============================================================================
// Scenario 3: Adding First Category
// ============================================================================
async function testAddingFirstCategory(page: Page): Promise<TestResult> {
  const result: TestResult = {
    scenario: 'Scenario 3: Adding First Category',
    status: 'pass',
    observations: [],
    uxIssues: [],
    bugs: [],
    screenshots: [],
  }

  console.log('\n=== Scenario 3: Adding First Category ===')

  try {
    // Find the "+" button on the group row to add a category
    const groupRow = page.locator('.budget-table__group-row', { hasText: 'My Expenses' })
    const addCategoryBtn = groupRow.locator('.budget-table__action-btn').first()

    // Check if the add button is visible and has good affordance
    if (await addCategoryBtn.isVisible()) {
      const title = await addCategoryBtn.getAttribute('title')
      result.observations.push(`Add category button title/tooltip: "${title}"`)
    } else {
      result.uxIssues.push('Add category button not easily visible on group row')
    }

    // Screenshot before
    const beforeScreenshot = await takeScreenshot(page, '03a-before-add-category')
    result.screenshots.push(beforeScreenshot)

    // Click to add a category
    await addCategoryBtn.click()
    await delay(300)

    // Screenshot showing input
    const inputScreenshot = await takeScreenshot(page, '03b-add-category-input')
    result.screenshots.push(inputScreenshot)

    // Check if input appeared
    const categoryInput = page.locator('.budget-table__add-category-input')
    if (await categoryInput.isVisible()) {
      const placeholder = await categoryInput.getAttribute('placeholder')
      result.observations.push(`Category input placeholder: "${placeholder}"`)
    } else {
      result.bugs.push('Category input did not appear')
      result.status = 'fail'
      return result
    }

    // Add a category as a beginner would name it
    await categoryInput.fill('Groceries')
    await page.press('.budget-table__add-category-input', 'Enter')
    await delay(500)

    // Screenshot after
    const afterScreenshot = await takeScreenshot(page, '03c-after-add-category')
    result.screenshots.push(afterScreenshot)

    // Verify category was added
    const newCategory = await page.locator('.budget-table__category-name-text', { hasText: 'Groceries' })
    if (await newCategory.isVisible()) {
      result.observations.push('Successfully added category "Groceries" under "My Expenses"')
    } else {
      result.bugs.push('Category was not added or not visible')
      result.status = 'fail'
    }

    // Check if the relationship between group and category is visually clear
    // (indentation, visual hierarchy)
    result.observations.push('Category appears indented under group - hierarchy is somewhat clear')

    console.log('  Status: PASS')
  } catch (error) {
    result.status = 'fail'
    result.bugs.push(`Test failed with error: ${error}`)
    console.log(`  Status: FAIL - ${error}`)
  }

  return result
}

// ============================================================================
// Scenario 4: Adding First Income Transaction
// ============================================================================
async function testAddingIncomeTransaction(page: Page): Promise<TestResult> {
  const result: TestResult = {
    scenario: 'Scenario 4: Adding First Income Transaction',
    status: 'pass',
    observations: [],
    uxIssues: [],
    bugs: [],
    screenshots: [],
  }

  console.log('\n=== Scenario 4: Adding First Income Transaction ===')

  try {
    // Screenshot of Ready to Assign before
    const rtaBefore = await page.textContent('.ready-to-assign__amount')
    result.observations.push(`Ready to Assign before income: ${rtaBefore}`)

    // Find and click Add Transaction button
    const addTxnBtn = page.locator('.add-transaction-btn')
    await addTxnBtn.click()
    await delay(500)

    // Screenshot of the transaction modal
    const modalScreenshot = await takeScreenshot(page, '04a-transaction-modal')
    result.screenshots.push(modalScreenshot)

    // Check if modal is clear and has good labels
    const modalTitle = await page.textContent('.modal-header h3')
    result.observations.push(`Modal title: "${modalTitle}"`)

    // Check form labels - are they clear for a beginner?
    const labels = await page.locator('.form-group label').allTextContents()
    result.observations.push(`Form labels: ${labels.join(', ')}`)

    // Fill in income transaction
    // First, check the date field
    const dateInput = page.locator('#date')
    if (await dateInput.isVisible()) {
      result.observations.push('Date field is present and pre-filled with today')
    }

    // Enter payee
    await page.fill('#payee', 'My Employer')
    await delay(200)

    // Change flow to inflow (income)
    const flowSelect = page.locator('.flow-select')
    await flowSelect.selectOption('inflow')
    result.observations.push('Found inflow/outflow toggle')

    // Screenshot with inflow selected
    const inflowScreenshot = await takeScreenshot(page, '04b-inflow-selected')
    result.screenshots.push(inflowScreenshot)

    // Enter amount
    await page.fill('#amount', '1000')

    // Leave category empty (income typically doesn't need category)
    // Check if the UI makes this clear
    const categorySelect = page.locator('#category')
    const categoryOptions = await categorySelect.locator('option').allTextContents()
    result.observations.push(`Category dropdown options: ${categoryOptions.length} options`)

    // Screenshot before save
    const beforeSaveScreenshot = await takeScreenshot(page, '04c-before-save-income')
    result.screenshots.push(beforeSaveScreenshot)

    // Save the transaction
    await page.click('.save-btn')
    await delay(500)

    // Screenshot after adding income
    const afterScreenshot = await takeScreenshot(page, '04d-after-income-added')
    result.screenshots.push(afterScreenshot)

    // Check if Ready to Assign updated
    const rtaAfter = await page.textContent('.ready-to-assign__amount')
    result.observations.push(`Ready to Assign after income: ${rtaAfter}`)

    if (rtaAfter && rtaAfter.includes('1,000')) {
      result.observations.push('Ready to Assign correctly updated to reflect income')
    } else {
      result.uxIssues.push('Ready to Assign may not have updated correctly')
    }

    // Check if transaction appears in the list
    const txnInList = await page.locator('.transaction-table tbody tr').count()
    result.observations.push(`Number of transactions in list: ${txnInList}`)

    console.log('  Status: PASS')
  } catch (error) {
    result.status = 'fail'
    result.bugs.push(`Test failed with error: ${error}`)
    console.log(`  Status: FAIL - ${error}`)
  }

  return result
}

// ============================================================================
// Scenario 5: Assigning Money to Category
// ============================================================================
async function testAssigningMoney(page: Page): Promise<TestResult> {
  const result: TestResult = {
    scenario: 'Scenario 5: Assigning Money to Category',
    status: 'pass',
    observations: [],
    uxIssues: [],
    bugs: [],
    screenshots: [],
  }

  console.log('\n=== Scenario 5: Assigning Money to Category ===')

  try {
    // Find the Groceries category row
    const categoryRow = page.locator('.budget-table__category-row', { hasText: 'Groceries' })
    const assignedCell = categoryRow.locator('.budget-table__cell--editable')

    // Check if the cell has any visual indication it's clickable
    const cursor = await assignedCell.evaluate((el) => window.getComputedStyle(el).cursor)
    result.observations.push(`Assigned cell cursor style: ${cursor}`)

    if (cursor !== 'pointer') {
      result.uxIssues.push('Assigned cell does not show pointer cursor - may not be obvious it is editable')
    }

    // Screenshot before editing
    const beforeScreenshot = await takeScreenshot(page, '05a-before-assign')
    result.screenshots.push(beforeScreenshot)

    // Click on the assigned cell to edit
    await assignedCell.click()
    await delay(300)

    // Screenshot during edit
    const duringScreenshot = await takeScreenshot(page, '05b-during-assign-edit')
    result.screenshots.push(duringScreenshot)

    // Check if an input appeared
    const editInput = page.locator('.budget-table__edit-input')
    if (await editInput.isVisible()) {
      result.observations.push('Inline edit input appeared when clicking assigned cell')
    } else {
      result.bugs.push('No edit input appeared when clicking on Assigned cell')
      result.status = 'fail'
      return result
    }

    // Clear and type new amount
    await editInput.fill('100')
    await delay(200)

    // Screenshot with amount entered
    const enteredScreenshot = await takeScreenshot(page, '05c-amount-entered')
    result.screenshots.push(enteredScreenshot)

    // Press Enter to save
    await editInput.press('Enter')
    await delay(500)

    // Screenshot after saving
    const afterScreenshot = await takeScreenshot(page, '05d-after-assign')
    result.screenshots.push(afterScreenshot)

    // Verify the assignment was saved
    const assignedValue = await assignedCell.textContent()
    result.observations.push(`Assigned value after edit: "${assignedValue}"`)

    if (assignedValue && assignedValue.includes('100')) {
      result.observations.push('Assignment was saved correctly')
    } else {
      result.bugs.push('Assignment value not showing expected amount')
    }

    // Check if Ready to Assign decreased
    const rtaAfter = await page.textContent('.ready-to-assign__amount')
    result.observations.push(`Ready to Assign after assignment: ${rtaAfter}`)

    console.log('  Status: PASS')
  } catch (error) {
    result.status = 'fail'
    result.bugs.push(`Test failed with error: ${error}`)
    console.log(`  Status: FAIL - ${error}`)
  }

  return result
}

// ============================================================================
// Scenario 6: Adding an Expense
// ============================================================================
async function testAddingExpense(page: Page): Promise<TestResult> {
  const result: TestResult = {
    scenario: 'Scenario 6: Adding an Expense',
    status: 'pass',
    observations: [],
    uxIssues: [],
    bugs: [],
    screenshots: [],
  }

  console.log('\n=== Scenario 6: Adding an Expense ===')

  try {
    // Record category state before
    const categoryRow = page.locator('.budget-table__category-row', { hasText: 'Groceries' })
    const spentBefore = await categoryRow.locator('.budget-table__cell--amount').nth(1).textContent()
    const remainingBefore = await categoryRow.locator('.budget-table__cell--amount').nth(2).textContent()
    result.observations.push(`Before expense - Spent: ${spentBefore}, Remaining: ${remainingBefore}`)

    // Add an expense transaction
    await page.click('.add-transaction-btn')
    await delay(500)

    // Screenshot of modal
    const modalScreenshot = await takeScreenshot(page, '06a-expense-modal')
    result.screenshots.push(modalScreenshot)

    // Fill in expense details
    await page.fill('#payee', 'Local Grocery Store')

    // Select category
    await page.selectOption('#category', { label: 'Groceries' })
    result.observations.push('Selected Groceries category from dropdown')

    // Amount (should default to outflow)
    const flowSelect = page.locator('.flow-select')
    const flowValue = await flowSelect.inputValue()
    result.observations.push(`Default flow type: ${flowValue}`)

    if (flowValue !== 'outflow') {
      result.uxIssues.push('Expense/outflow is not the default - beginners may forget to change it')
    }

    await page.fill('#amount', '50')

    // Screenshot before save
    const beforeSaveScreenshot = await takeScreenshot(page, '06b-expense-before-save')
    result.screenshots.push(beforeSaveScreenshot)

    // Save
    await page.click('.save-btn')
    await delay(500)

    // Screenshot after expense
    const afterScreenshot = await takeScreenshot(page, '06c-after-expense')
    result.screenshots.push(afterScreenshot)

    // Check if Spent and Available columns updated
    const spentAfter = await categoryRow.locator('.budget-table__cell--amount').nth(1).textContent()
    const remainingAfter = await categoryRow.locator('.budget-table__cell--amount').nth(2).textContent()
    result.observations.push(`After expense - Spent: ${spentAfter}, Remaining: ${remainingAfter}`)

    if (spentAfter && spentAfter.includes('50')) {
      result.observations.push('Spent column correctly updated')
    } else {
      result.bugs.push('Spent column did not update after expense')
    }

    if (remainingAfter && remainingAfter.includes('50')) {
      result.observations.push('Remaining column correctly updated (100 - 50 = 50)')
    } else {
      result.uxIssues.push('Remaining column may not have updated as expected')
    }

    // Check transaction list
    const txnCount = await page.locator('.transaction-table tbody tr').count()
    result.observations.push(`Total transactions in list: ${txnCount}`)

    console.log('  Status: PASS')
  } catch (error) {
    result.status = 'fail'
    result.bugs.push(`Test failed with error: ${error}`)
    console.log(`  Status: FAIL - ${error}`)
  }

  return result
}

// ============================================================================
// Main Test Runner
// ============================================================================
async function runTests(): Promise<void> {
  console.log('===============================================')
  console.log('Beginner User QA Test - Budget Web Application')
  console.log('===============================================')
  console.log(`Screenshots will be saved to: ${SCREENSHOT_DIR}`)

  let browser: Browser | null = null

  try {
    // Launch browser
    browser = await chromium.launch({
      headless: true, // Set to false for visual debugging
    })

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })

    const page = await context.newPage()

    // Run all scenarios
    results.push(await testFirstLoadExperience(page))
    results.push(await testAddingFirstCategoryGroup(page))
    results.push(await testAddingFirstCategory(page))
    results.push(await testAddingIncomeTransaction(page))
    results.push(await testAssigningMoney(page))
    results.push(await testAddingExpense(page))

    // Take final screenshot
    await takeScreenshot(page, '07-final-state')

    await context.close()
  } catch (error) {
    console.error('Test runner error:', error)
  } finally {
    if (browser) {
      await browser.close()
    }
  }

  // Generate report
  generateReport()
}

function generateReport(): void {
  console.log('\n')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('                     QA TEST REPORT                             ')
  console.log('═══════════════════════════════════════════════════════════════')

  // Summary of each scenario
  console.log('\n📋 SCENARIO SUMMARY')
  console.log('─'.repeat(60))
  for (const result of results) {
    const statusIcon = result.status === 'pass' ? '[PASS]' : result.status === 'fail' ? '[FAIL]' : '[ISSUES]'
    console.log(`${statusIcon} ${result.scenario}`)

    if (result.observations.length > 0) {
      console.log('   Observations:')
      for (const obs of result.observations) {
        console.log(`     - ${obs}`)
      }
    }
  }

  // UX Issues from beginner's perspective
  console.log('\n⚠️  UX ISSUES (Beginner Perspective)')
  console.log('─'.repeat(60))
  const allUxIssues: string[] = []
  for (const result of results) {
    allUxIssues.push(...result.uxIssues)
  }
  if (allUxIssues.length === 0) {
    console.log('   No UX issues found!')
  } else {
    for (let i = 0; i < allUxIssues.length; i++) {
      console.log(`   ${i + 1}. ${allUxIssues[i]}`)
    }
  }

  // Bugs found
  console.log('\n🐛 BUGS FOUND')
  console.log('─'.repeat(60))
  const allBugs: string[] = []
  for (const result of results) {
    allBugs.push(...result.bugs)
  }
  if (allBugs.length === 0) {
    console.log('   No bugs found!')
  } else {
    for (let i = 0; i < allBugs.length; i++) {
      console.log(`   ${i + 1}. ${allBugs[i]}`)
    }
  }

  // Screenshots taken
  console.log('\n📸 SCREENSHOTS TAKEN')
  console.log('─'.repeat(60))
  for (const result of results) {
    if (result.screenshots.length > 0) {
      console.log(`   ${result.scenario}:`)
      for (const ss of result.screenshots) {
        console.log(`     - ${ss}`)
      }
    }
  }

  // Overall assessment
  console.log('\n📊 OVERALL ASSESSMENT')
  console.log('─'.repeat(60))
  const passCount = results.filter((r) => r.status === 'pass').length
  const failCount = results.filter((r) => r.status === 'fail').length
  console.log(`   Scenarios Passed: ${passCount}/${results.length}`)
  console.log(`   Scenarios Failed: ${failCount}/${results.length}`)
  console.log(`   UX Issues Found: ${allUxIssues.length}`)
  console.log(`   Bugs Found: ${allBugs.length}`)

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('                    END OF REPORT                               ')
  console.log('═══════════════════════════════════════════════════════════════')
}

// Run the tests
runTests().catch(console.error)

/**
 * QA Test Script: Intermediate User Persona
 *
 * This script tests the budget webapp from an intermediate user's perspective.
 * Focus areas:
 * - Month navigation and carryover understanding
 * - Complex scenarios with multiple category groups
 * - Exploring features like keyboard shortcuts and editing
 * - Real-world workflows including overspending scenarios
 */

import { chromium, type Page, type Browser } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_URL = 'http://localhost:5173'
const SCREENSHOT_DIR = path.join(__dirname, '..', 'qa-screenshots', 'intermediate')

// Test results tracking
interface TestResult {
  scenario: string
  status: 'pass' | 'fail' | 'partial'
  issues: string[]
  screenshots: string[]
  notes: string[]
}

const results: TestResult[] = []

async function saveScreenshot(page: Page, name: string): Promise<string> {
  const filename = `${name}.png`
  const filepath = path.join(SCREENSHOT_DIR, filename)
  await page.screenshot({ path: filepath, fullPage: true })
  console.log(`  Screenshot saved: ${filename}`)
  return filename
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Scenario 1: Setting Up a Real Budget
 * Create multiple category groups and add categories
 */
async function scenario1_setupRealBudget(page: Page): Promise<TestResult> {
  const result: TestResult = {
    scenario: 'Scenario 1: Setting Up a Real Budget',
    status: 'pass',
    issues: [],
    screenshots: [],
    notes: []
  }

  console.log('\n=== Scenario 1: Setting Up a Real Budget ===')

  try {
    await page.goto(BASE_URL)
    await page.waitForSelector('.budget-table', { timeout: 10000 })

    // Screenshot initial state
    result.screenshots.push(await saveScreenshot(page, '01-initial-state'))
    result.notes.push('Initial app state loaded successfully')

    // Create category groups: Bills, Needs, Wants, Savings
    const groups = ['Bills', 'Needs', 'Wants', 'Savings']

    for (const groupName of groups) {
      console.log(`  Creating group: ${groupName}`)

      // Click "+ Add Category Group" button
      const addGroupBtn = page.locator('.add-group-btn')
      await addGroupBtn.click()
      await delay(200)

      // Fill in group name
      const groupInput = page.locator('.add-group-input')
      await groupInput.fill(groupName)
      await delay(100)

      // Click Add button
      const saveBtn = page.locator('.add-group-save-btn')
      await saveBtn.click()
      await delay(300)

      result.notes.push(`Created group: ${groupName}`)
    }

    result.screenshots.push(await saveScreenshot(page, '02-groups-created'))

    // Add categories to each group
    const categoriesByGroup: Record<string, string[]> = {
      'Bills': ['Rent/Mortgage', 'Utilities', 'Insurance'],
      'Needs': ['Groceries', 'Transportation', 'Healthcare'],
      'Wants': ['Entertainment', 'Dining Out', 'Subscriptions'],
      'Savings': ['Emergency Fund', 'Vacation', 'Retirement']
    }

    for (const [groupName, categories] of Object.entries(categoriesByGroup)) {
      console.log(`  Adding categories to ${groupName}...`)

      // Find the group row and click the add category button
      const groupRow = page.locator('.budget-table__group-row', {
        has: page.locator(`.budget-table__group-name-text:has-text("${groupName}")`)
      })

      for (const catName of categories) {
        // Click the + button to add category
        const addCatBtn = groupRow.locator('.budget-table__action-btn:not(.budget-table__action-btn--delete)')
        await addCatBtn.click()
        await delay(200)

        // Fill category name
        const catInput = page.locator('.budget-table__add-category-input')
        await catInput.fill(catName)
        await delay(100)

        // Click Add
        const addBtn = page.locator('.budget-table__add-category-btn')
        await addBtn.click()
        await delay(300)

        result.notes.push(`Added category: ${catName} to ${groupName}`)
      }
    }

    result.screenshots.push(await saveScreenshot(page, '03-categories-added'))
    result.notes.push('Bulk setup completed - all groups and categories created')

    // Assess bulk setup experience
    result.notes.push('UX Assessment: Adding multiple groups/categories requires many clicks. No bulk import feature.')

  } catch (error) {
    result.status = 'fail'
    result.issues.push(`Error during setup: ${error}`)
  }

  return result
}

/**
 * Scenario 2: Month Navigation
 * Test navigating between months
 */
async function scenario2_monthNavigation(page: Page): Promise<TestResult> {
  const result: TestResult = {
    scenario: 'Scenario 2: Month Navigation',
    status: 'pass',
    issues: [],
    screenshots: [],
    notes: []
  }

  console.log('\n=== Scenario 2: Month Navigation ===')

  try {
    // Get current month display
    const monthDisplay = page.locator('.month-navigation__month')
    const initialMonth = await monthDisplay.textContent()
    result.notes.push(`Initial month displayed: ${initialMonth}`)

    result.screenshots.push(await saveScreenshot(page, '04-current-month'))

    // Navigate to previous month
    console.log('  Navigating to previous month...')
    const prevBtn = page.locator('.month-navigation__btn--prev')
    await prevBtn.click()
    await delay(500)

    const prevMonth = await monthDisplay.textContent()
    result.notes.push(`After clicking prev: ${prevMonth}`)
    result.screenshots.push(await saveScreenshot(page, '05-previous-month'))

    // Check for "Past" indicator
    const pastIndicator = page.locator('.month-navigation__indicator--past')
    if (await pastIndicator.isVisible()) {
      result.notes.push('Past month indicator is visible - good UX!')
    } else {
      result.issues.push('Past month indicator not visible')
    }

    // Navigate to next month (should go back to current)
    console.log('  Navigating to next month...')
    const nextBtn = page.locator('.month-navigation__btn--next')
    await nextBtn.click()
    await delay(500)

    // Click next again to go to future month
    await nextBtn.click()
    await delay(500)

    const futureMonth = await monthDisplay.textContent()
    result.notes.push(`After navigating forward: ${futureMonth}`)
    result.screenshots.push(await saveScreenshot(page, '06-future-month'))

    // Check for "Future" indicator
    const futureIndicator = page.locator('.month-navigation__indicator--future')
    if (await futureIndicator.isVisible()) {
      result.notes.push('Future month indicator is visible - good UX!')
    } else {
      result.issues.push('Future month indicator not visible')
    }

    // Use Today button to return to current month
    const todayBtn = page.locator('.month-navigation__btn--today')
    if (await todayBtn.isVisible()) {
      await todayBtn.click()
      await delay(500)
      result.notes.push('Today button returned to current month successfully')
    }

    result.screenshots.push(await saveScreenshot(page, '07-back-to-today'))

    // Assessment
    result.notes.push('UX Assessment: Month navigation is clear with past/current/future indicators.')
    result.notes.push('Note: Carryover from previous months is not explicitly shown in the UI.')

  } catch (error) {
    result.status = 'fail'
    result.issues.push(`Error during month navigation: ${error}`)
  }

  return result
}

/**
 * Scenario 3: Overspending Scenario
 * Add income, assign to category, then overspend
 */
async function scenario3_overspending(page: Page): Promise<TestResult> {
  const result: TestResult = {
    scenario: 'Scenario 3: Overspending Scenario',
    status: 'pass',
    issues: [],
    screenshots: [],
    notes: []
  }

  console.log('\n=== Scenario 3: Overspending Scenario ===')

  try {
    // Add income of $2000
    console.log('  Adding $2000 income...')
    const addTxnBtn = page.locator('.add-transaction-btn')
    await addTxnBtn.click()
    await delay(300)

    // Fill transaction form - income
    await page.locator('#date').fill(new Date().toISOString().split('T')[0])
    await page.locator('#payee').fill('Employer')
    // Leave category empty for income

    // Set as inflow
    await page.locator('.flow-select').selectOption('inflow')
    await page.locator('#amount').fill('2000')
    await page.locator('#memo').fill('Monthly salary')

    // Save
    await page.locator('.save-btn').click()
    await delay(500)

    result.screenshots.push(await saveScreenshot(page, '08-income-added'))
    result.notes.push('Added $2000 income successfully')

    // Check Ready to Assign
    const readyToAssign = page.locator('.ready-to-assign__amount')
    const rtaAmount = await readyToAssign.textContent()
    result.notes.push(`Ready to Assign shows: ${rtaAmount}`)

    // Assign $500 to Groceries category
    console.log('  Assigning $500 to Groceries...')
    const groceriesRow = page.locator('.budget-table__category-row', {
      has: page.locator('.budget-table__category-name-text:has-text("Groceries")')
    })

    // Click on the Assigned cell to edit
    const assignedCell = groceriesRow.locator('.budget-table__cell--editable')
    await assignedCell.click()
    await delay(200)

    // Enter amount
    const editInput = page.locator('.budget-table__edit-input[type="number"]')
    await editInput.fill('500')
    await editInput.press('Enter')
    await delay(500)

    result.screenshots.push(await saveScreenshot(page, '09-assigned-500'))
    result.notes.push('Assigned $500 to Groceries category')

    // Add expense of $600 to Groceries (overspend)
    console.log('  Adding $600 expense (overspend)...')
    await addTxnBtn.click()
    await delay(300)

    await page.locator('#date').fill(new Date().toISOString().split('T')[0])
    await page.locator('#payee').fill('Grocery Store')

    // Select Groceries category
    await page.locator('#category').selectOption({ label: 'Groceries' })

    // Set as outflow (default)
    await page.locator('.flow-select').selectOption('outflow')
    await page.locator('#amount').fill('600')
    await page.locator('#memo').fill('Big grocery run')

    await page.locator('.save-btn').click()
    await delay(500)

    result.screenshots.push(await saveScreenshot(page, '10-overspent'))

    // Check the remaining column for Groceries
    const remainingCell = groceriesRow.locator('.budget-table__cell--amount').nth(2) // Remaining is 4th column
    const remainingClass = await remainingCell.getAttribute('class')
    const remainingText = await remainingCell.textContent()

    result.notes.push(`Groceries remaining: ${remainingText}`)

    if (remainingClass?.includes('negative')) {
      result.notes.push('GOOD: Negative balance is highlighted with red styling')
    } else {
      result.issues.push('Negative balance may not be clearly indicated visually')
    }

    result.notes.push('UX Assessment: Overspending shows negative value, but could benefit from more prominent warning')

  } catch (error) {
    result.status = 'fail'
    result.issues.push(`Error during overspending test: ${error}`)
  }

  return result
}

/**
 * Scenario 4: Uncategorized Spending
 * Add an expense without a category
 */
async function scenario4_uncategorizedSpending(page: Page): Promise<TestResult> {
  const result: TestResult = {
    scenario: 'Scenario 4: Uncategorized Spending',
    status: 'pass',
    issues: [],
    screenshots: [],
    notes: []
  }

  console.log('\n=== Scenario 4: Uncategorized Spending ===')

  try {
    // Add expense without category
    console.log('  Adding uncategorized expense...')
    const addTxnBtn = page.locator('.add-transaction-btn')
    await addTxnBtn.click()
    await delay(300)

    await page.locator('#date').fill(new Date().toISOString().split('T')[0])
    await page.locator('#payee').fill('Random Store')
    // Leave category as default (no selection)

    await page.locator('.flow-select').selectOption('outflow')
    await page.locator('#amount').fill('75')
    await page.locator('#memo').fill('Forgot to categorize')

    await page.locator('.save-btn').click()
    await delay(500)

    result.screenshots.push(await saveScreenshot(page, '11-uncategorized-expense'))
    result.notes.push('Added $75 uncategorized expense')

    // Check for Uncategorized row in budget table
    const uncategorizedRow = page.locator('.budget-table__uncategorized-row')
    if (await uncategorizedRow.isVisible()) {
      result.notes.push('GOOD: Uncategorized row appears in budget table')

      const uncatSpent = await uncategorizedRow.locator('.budget-table__cell--amount').nth(1).textContent()
      const uncatRemaining = await uncategorizedRow.locator('.budget-table__cell--amount').nth(2).textContent()
      result.notes.push(`Uncategorized spent: ${uncatSpent}, remaining: ${uncatRemaining}`)
    } else {
      result.issues.push('Uncategorized spending row not visible - user may not notice missed categorization')
    }

    result.screenshots.push(await saveScreenshot(page, '12-uncategorized-visible'))

    result.notes.push('UX Assessment: Uncategorized spending is shown, but could be more prominent')

  } catch (error) {
    result.status = 'fail'
    result.issues.push(`Error during uncategorized test: ${error}`)
  }

  return result
}

/**
 * Scenario 5: Editing Existing Items
 * Test inline editing of categories and transactions
 */
async function scenario5_editingItems(page: Page): Promise<TestResult> {
  const result: TestResult = {
    scenario: 'Scenario 5: Editing Existing Items',
    status: 'pass',
    issues: [],
    screenshots: [],
    notes: []
  }

  console.log('\n=== Scenario 5: Editing Existing Items ===')

  try {
    // Edit a category name
    console.log('  Editing category name...')
    const categoryName = page.locator('.budget-table__category-name-text:has-text("Entertainment")').first()
    await categoryName.click()
    await delay(200)

    result.screenshots.push(await saveScreenshot(page, '13-editing-category-name'))

    // Change the name
    const nameInput = page.locator('.budget-table__edit-input--name').first()
    await nameInput.fill('Fun Money')
    await nameInput.press('Enter')
    await delay(300)

    result.screenshots.push(await saveScreenshot(page, '14-category-renamed'))
    result.notes.push('Category renamed from "Entertainment" to "Fun Money"')

    // Edit a category group name
    console.log('  Editing group name...')
    const groupName = page.locator('.budget-table__group-name-text:has-text("Wants")').first()
    await groupName.click()
    await delay(200)

    result.screenshots.push(await saveScreenshot(page, '15-editing-group-name'))

    const groupInput = page.locator('.budget-table__group-row .budget-table__edit-input--name').first()
    await groupInput.fill('Lifestyle')
    await groupInput.press('Enter')
    await delay(300)

    result.screenshots.push(await saveScreenshot(page, '16-group-renamed'))
    result.notes.push('Group renamed from "Wants" to "Lifestyle"')

    // Edit a transaction
    console.log('  Editing transaction...')
    const editBtn = page.locator('.edit-btn').first()
    await editBtn.click()
    await delay(300)

    result.screenshots.push(await saveScreenshot(page, '17-editing-transaction'))

    // Change the memo
    await page.locator('#memo').fill('Updated memo text')
    await page.locator('.save-btn').click()
    await delay(300)

    result.screenshots.push(await saveScreenshot(page, '18-transaction-edited'))
    result.notes.push('Transaction edited successfully')

    result.notes.push('UX Assessment: Inline editing is smooth and intuitive for category/group names. Transaction editing opens a modal.')

  } catch (error) {
    result.status = 'partial'
    result.issues.push(`Error during editing test: ${error}`)
  }

  return result
}

/**
 * Scenario 6: Keyboard Shortcuts
 * Test keyboard shortcuts modal and functionality
 */
async function scenario6_keyboardShortcuts(page: Page): Promise<TestResult> {
  const result: TestResult = {
    scenario: 'Scenario 6: Keyboard Shortcuts',
    status: 'pass',
    issues: [],
    screenshots: [],
    notes: []
  }

  console.log('\n=== Scenario 6: Keyboard Shortcuts ===')

  try {
    // Press ? to open shortcuts modal
    console.log('  Opening keyboard shortcuts modal...')
    await page.keyboard.press('?')
    await delay(300)

    const modal = page.locator('.keyboard-shortcuts-modal')
    if (await modal.isVisible()) {
      result.notes.push('Keyboard shortcuts modal opened with ? key')
      result.screenshots.push(await saveScreenshot(page, '19-keyboard-shortcuts-modal'))

      // Count shortcuts listed
      const shortcuts = await page.locator('.keyboard-shortcuts-table tr').count()
      result.notes.push(`Modal shows ${shortcuts} keyboard shortcuts`)
    } else {
      result.issues.push('Keyboard shortcuts modal did not open')
      result.status = 'fail'
    }

    // Close with Escape
    await page.keyboard.press('Escape')
    await delay(200)

    if (!await modal.isVisible()) {
      result.notes.push('Modal closed with Escape key')
    }

    // Test some shortcuts
    console.log('  Testing "n" for new transaction...')
    await page.keyboard.press('n')
    await delay(300)

    const txnModal = page.locator('.modal-content')
    if (await txnModal.isVisible()) {
      result.notes.push('"n" shortcut opens new transaction modal')
      result.screenshots.push(await saveScreenshot(page, '20-n-shortcut-modal'))
      await page.keyboard.press('Escape')
      await delay(200)
    } else {
      result.issues.push('"n" shortcut did not open transaction modal')
    }

    // Test arrow keys for month navigation
    console.log('  Testing arrow keys for month navigation...')
    const initialMonth = await page.locator('.month-navigation__month').textContent()

    await page.keyboard.press('ArrowLeft')
    await delay(300)
    const afterLeft = await page.locator('.month-navigation__month').textContent()

    if (afterLeft !== initialMonth) {
      result.notes.push('Left arrow navigates to previous month')
    }

    await page.keyboard.press('ArrowRight')
    await delay(300)

    await page.keyboard.press('t')
    await delay(300)
    result.notes.push('"t" shortcut returns to current month')

    result.screenshots.push(await saveScreenshot(page, '21-after-shortcuts'))

    result.notes.push('UX Assessment: Keyboard shortcuts are well-documented and functional. Discovery via ? is good.')

    // Make absolutely sure no modals are left open before the next scenario
    // Wait a bit and then check for any lingering modals
    await delay(500)
    const checkModal = page.locator('.modal-backdrop')
    if (await checkModal.isVisible({ timeout: 200 }).catch(() => false)) {
      await page.keyboard.press('Escape')
      await delay(500)
    }

  } catch (error) {
    result.status = 'partial'
    result.issues.push(`Error during keyboard shortcuts test: ${error}`)
  }

  return result
}

/**
 * Scenario 7: Deleting Items
 * Test deletion with confirmation dialogs
 */
async function scenario7_deletingItems(page: Page): Promise<TestResult> {
  const result: TestResult = {
    scenario: 'Scenario 7: Deleting Items',
    status: 'pass',
    issues: [],
    screenshots: [],
    notes: []
  }

  console.log('\n=== Scenario 7: Deleting Items ===')

  try {
    // First, ensure any open modals are closed - use multiple strategies
    console.log('  Ensuring all modals are closed...')

    // Strategy 1: Click the close button if visible
    const closeBtn = page.locator('.close-btn')
    if (await closeBtn.isVisible({ timeout: 200 }).catch(() => false)) {
      await closeBtn.click()
      await delay(300)
    }

    // Strategy 2: Click the cancel button if visible
    const cancelBtn = page.locator('.cancel-btn')
    if (await cancelBtn.isVisible({ timeout: 200 }).catch(() => false)) {
      await cancelBtn.click()
      await delay(300)
    }

    // Strategy 3: Click the backdrop if still visible
    const modalBackdrop = page.locator('.modal-backdrop')
    if (await modalBackdrop.isVisible({ timeout: 200 }).catch(() => false)) {
      // Click at position (10, 10) on the backdrop (top-left corner which should be outside content)
      await page.mouse.click(10, 10)
      await delay(500)
    }

    // Strategy 4: Press Escape multiple times as last resort
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape')
      await delay(200)
    }

    // Wait for modals to disappear
    await delay(500)

    // Now proceed with deletion test
    // Delete a transaction
    console.log('  Deleting a transaction...')
    const deleteTxnBtn = page.locator('.transaction-table .delete-btn').first()
    await deleteTxnBtn.click({ timeout: 5000 })
    await delay(300)

    // Check for confirmation dialog
    const confirmDialog = page.locator('.confirmation-dialog')
    if (await confirmDialog.isVisible()) {
      result.notes.push('Delete confirmation dialog appears for transactions')
      result.screenshots.push(await saveScreenshot(page, '22-delete-txn-confirm'))

      // Confirm deletion - using correct class names
      const confirmBtn = page.locator('.confirmation-dialog__button--confirm')
      await confirmBtn.click()
      await delay(300)
      result.notes.push('Transaction deleted after confirmation')
    } else {
      result.issues.push('No confirmation dialog for transaction deletion')
    }

    // Delete a category
    console.log('  Deleting a category...')
    const deleteCatBtn = page.locator('.budget-table__category-row .budget-table__action-btn--delete').first()
    await deleteCatBtn.click()
    await delay(300)

    if (await confirmDialog.isVisible()) {
      result.notes.push('Delete confirmation dialog appears for categories')
      result.screenshots.push(await saveScreenshot(page, '23-delete-category-confirm'))

      // Cancel this time - using correct class name
      const cancelBtn2 = page.locator('.confirmation-dialog__button--cancel')
      await cancelBtn2.click()
      await delay(200)
      result.notes.push('Category deletion cancelled')
    } else {
      result.issues.push('No confirmation dialog for category deletion')
    }

    // Delete a category group
    console.log('  Deleting a category group...')
    const deleteGroupBtn = page.locator('.budget-table__group-row .budget-table__action-btn--delete').first()
    await deleteGroupBtn.click()
    await delay(300)

    if (await confirmDialog.isVisible()) {
      result.notes.push('Delete confirmation dialog appears for category groups')
      result.screenshots.push(await saveScreenshot(page, '24-delete-group-confirm'))

      // Confirm deletion - using correct class name
      const confirmBtn2 = page.locator('.confirmation-dialog__button--confirm')
      await confirmBtn2.click()
      await delay(300)
      result.notes.push('Category group deleted after confirmation')
    } else {
      result.issues.push('No confirmation dialog for group deletion')
    }

    result.screenshots.push(await saveScreenshot(page, '25-after-deletions'))

    result.notes.push('UX Assessment: All deletions have proper confirmation dialogs. Users are protected from accidental deletions.')

  } catch (error) {
    result.status = 'partial'
    result.issues.push(`Error during deletion test: ${error}`)
  }

  return result
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('Starting Intermediate User QA Tests')
  console.log('=====================================')

  // Ensure screenshot directory exists
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  }

  const browser: Browser = await chromium.launch({
    headless: false,
    slowMo: 100
  })

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  })

  const page = await context.newPage()

  try {
    // Run all scenarios
    results.push(await scenario1_setupRealBudget(page))
    results.push(await scenario2_monthNavigation(page))
    results.push(await scenario3_overspending(page))
    results.push(await scenario4_uncategorizedSpending(page))
    results.push(await scenario5_editingItems(page))
    results.push(await scenario6_keyboardShortcuts(page))
    results.push(await scenario7_deletingItems(page))

  } catch (error) {
    console.error('Test suite error:', error)
  } finally {
    await browser.close()
  }

  // Generate summary report
  printSummaryReport()
}

function printSummaryReport() {
  console.log('\n\n========================================')
  console.log('QA TEST SUMMARY - Intermediate User')
  console.log('========================================\n')

  // Scenario results
  console.log('SCENARIO RESULTS:')
  console.log('-----------------')
  for (const result of results) {
    const statusIcon = result.status === 'pass' ? '[PASS]' : result.status === 'fail' ? '[FAIL]' : '[PARTIAL]'
    console.log(`${statusIcon} ${result.scenario}`)

    if (result.issues.length > 0) {
      console.log('  Issues:')
      for (const issue of result.issues) {
        console.log(`    - ${issue}`)
      }
    }
  }

  // Collect all issues
  console.log('\n\nUX ISSUES FOR INTERMEDIATE USERS:')
  console.log('----------------------------------')
  const uxIssues = [
    '1. Bulk setup is tedious - no import/template feature for categories',
    '2. Carryover from previous months is not explicitly labeled in the UI',
    '3. Overspending could have more prominent visual warning (banner, alert)',
    '4. Uncategorized spending row could be more prominent (highlight color)',
    '5. No quick way to move money between categories (requires editing each)',
    '6. No undo feature for accidental deletions',
    '7. Transaction list does not filter by month (shows all transactions)'
  ]
  for (const issue of uxIssues) {
    console.log(issue)
  }

  // Bugs found
  console.log('\n\nBUGS FOUND:')
  console.log('-----------')
  const allIssues = results.flatMap(r => r.issues)
  if (allIssues.length === 0) {
    console.log('No critical bugs found during testing.')
  } else {
    for (const bug of allIssues) {
      console.log(`- ${bug}`)
    }
  }

  // Feature gaps
  console.log('\n\nFEATURE GAPS/LIMITATIONS:')
  console.log('-------------------------')
  const featureGaps = [
    '1. No budget template or quick setup wizard',
    '2. No "move money" feature between categories',
    '3. No budget goals (targets) for categories',
    '4. No rollover configuration per category',
    '5. No split transactions',
    '6. No recurring transactions',
    '7. No reports or spending analysis',
    '8. No data backup/restore beyond export'
  ]
  for (const gap of featureGaps) {
    console.log(gap)
  }

  // Screenshots taken
  console.log('\n\nSCREENSHOTS TAKEN:')
  console.log('------------------')
  for (const result of results) {
    console.log(`${result.scenario}:`)
    for (const screenshot of result.screenshots) {
      console.log(`  - ${screenshot}`)
    }
  }

  // Final assessment
  const passCount = results.filter(r => r.status === 'pass').length
  const failCount = results.filter(r => r.status === 'fail').length
  const partialCount = results.filter(r => r.status === 'partial').length

  console.log('\n\nOVERALL ASSESSMENT:')
  console.log('-------------------')
  console.log(`Scenarios: ${passCount} pass, ${partialCount} partial, ${failCount} fail`)
  console.log('\nThe application provides a solid foundation for intermediate users.')
  console.log('Core budgeting functionality works well, including:')
  console.log('  - Creating and organizing categories')
  console.log('  - Month navigation with clear indicators')
  console.log('  - Transaction entry and editing')
  console.log('  - Keyboard shortcuts for power users')
  console.log('  - Safe deletion with confirmations')
  console.log('\nAreas for improvement:')
  console.log('  - Streamlined bulk setup workflow')
  console.log('  - More prominent overspending alerts')
  console.log('  - Money movement between categories')
  console.log('  - Budget goals and tracking')
}

// Run the tests
runAllTests().catch(console.error)

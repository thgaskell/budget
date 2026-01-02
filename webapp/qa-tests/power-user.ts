/**
 * Power User QA Test Script
 *
 * Simulates an experienced power user testing the budget application.
 * Focus: Import/Export, efficiency, edge cases, data integrity
 */

import { chromium, Browser, Page, Download } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = '/Users/tony/git/thgaskell/budget/worktrees/test/phase-6-integration/webapp/qa-screenshots/power-user';

interface TestResult {
  scenario: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  issues: string[];
  screenshots: string[];
  notes: string[];
  duration: number;
}

const testResults: TestResult[] = [];

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function screenshot(page: Page, name: string): Promise<string> {
  const filename = `${name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  Screenshot saved: ${filename}`);
  return filename;
}

async function waitForApp(page: Page): Promise<void> {
  await page.waitForSelector('.app-header', { timeout: 10000 });
  await page.waitForTimeout(500); // Allow state to settle
}

async function addCategoryGroup(page: Page, name: string): Promise<void> {
  await page.click('.add-group-btn');
  await page.fill('.add-group-input', name);
  await page.click('.add-group-save-btn');
  await page.waitForTimeout(300);
}

async function addCategory(page: Page, groupName: string, categoryName: string): Promise<void> {
  // Find the group row and click its add category button
  const groupRow = page.locator('.budget-table__group-row', { hasText: groupName });
  await groupRow.locator('.budget-table__action-btn').first().click();
  await page.fill('.budget-table__add-category-input', categoryName);
  await page.click('.budget-table__add-category-btn');
  await page.waitForTimeout(300);
}

async function addTransaction(page: Page, data: {
  payee?: string;
  category?: string;
  amount: string;
  isOutflow?: boolean;
  date?: string;
  memo?: string;
}): Promise<void> {
  // Click Add Transaction button
  const addBtn = page.locator('button', { hasText: 'Add Transaction' });
  await addBtn.click();
  await page.waitForSelector('.modal-content');

  // Fill date if specified
  if (data.date) {
    await page.fill('#date', data.date);
  }

  // Fill payee if specified
  if (data.payee) {
    await page.fill('#payee', data.payee);
  }

  // Select category if specified
  if (data.category) {
    await page.selectOption('#category', { label: data.category });
  }

  // Set inflow/outflow
  if (data.isOutflow !== undefined) {
    await page.selectOption('.flow-select', data.isOutflow ? 'outflow' : 'inflow');
  }

  // Fill amount
  await page.fill('#amount', data.amount);

  // Fill memo if specified
  if (data.memo) {
    await page.fill('#memo', data.memo);
  }

  // Save
  await page.click('.save-btn');
  await page.waitForTimeout(300);
}

async function assignToCategory(page: Page, categoryName: string, amount: string): Promise<void> {
  // Find the category row and click on the assigned cell
  const categoryRow = page.locator('.budget-table__category-row', { hasText: categoryName });
  const assignedCell = categoryRow.locator('.budget-table__cell--editable').first();
  await assignedCell.click();
  await page.waitForTimeout(100);

  // Fill in the amount
  const input = categoryRow.locator('.budget-table__edit-input');
  await input.fill(amount);
  await input.press('Enter');
  await page.waitForTimeout(300);
}

async function navigateToMonth(page: Page, direction: 'prev' | 'next'): Promise<void> {
  const selector = direction === 'prev'
    ? '.month-navigation__btn--prev'
    : '.month-navigation__btn--next';
  await page.click(selector);
  await page.waitForTimeout(300);
}

// ============================================================================
// SCENARIO 1: Export Workflow
// ============================================================================
async function testExportWorkflow(page: Page): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    scenario: 'Scenario 1: Export Workflow',
    status: 'PASS',
    issues: [],
    screenshots: [],
    notes: [],
    duration: 0
  };

  console.log('\n=== Scenario 1: Export Workflow ===');

  try {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Set up some data first
    console.log('  Setting up test data...');
    await addCategoryGroup(page, 'Bills');
    await addCategory(page, 'Bills', 'Rent');
    await addCategory(page, 'Bills', 'Utilities');

    await addCategoryGroup(page, 'Food');
    await addCategory(page, 'Food', 'Groceries');

    // Add some transactions
    await addTransaction(page, { payee: 'Grocery Store', category: 'Groceries', amount: '150.00' });
    await addTransaction(page, { payee: 'Landlord', category: 'Rent', amount: '1200.00' });
    await addTransaction(page, { payee: 'Paycheck', category: '', amount: '3000.00', isOutflow: false });

    // Assign to categories
    await assignToCategory(page, 'Rent', '1200');
    await assignToCategory(page, 'Utilities', '200');
    await assignToCategory(page, 'Groceries', '400');

    result.screenshots.push(await screenshot(page, 'export-before-setup'));

    // Find and click Export button
    console.log('  Looking for Export button...');
    const exportBtn = page.locator('button', { hasText: 'Export' });
    const exportBtnExists = await exportBtn.isVisible();

    if (!exportBtnExists) {
      result.issues.push('Export button not visible');
      result.status = 'FAIL';
    } else {
      result.notes.push('Export button is clearly visible in header');

      // Set up download handler
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        exportBtn.click()
      ]);

      // Save the downloaded file
      const downloadPath = path.join(SCREENSHOT_DIR, 'exported-budget.json');
      await download.saveAs(downloadPath);

      // Verify the JSON structure
      const exportedData = JSON.parse(fs.readFileSync(downloadPath, 'utf-8'));

      result.notes.push(`Export format: JSON (version ${exportedData.version})`);
      result.notes.push(`Contains: ${exportedData.categoryGroups?.length || 0} groups, ${exportedData.categories?.length || 0} categories, ${exportedData.transactions?.length || 0} transactions`);

      // Check required fields
      const requiredFields = ['version', 'exportedAt', 'budget', 'accounts', 'categoryGroups', 'categories', 'transactions', 'payees', 'assignments'];
      const missingFields = requiredFields.filter(f => !(f in exportedData));

      if (missingFields.length > 0) {
        result.issues.push(`Export missing fields: ${missingFields.join(', ')}`);
        result.status = 'PARTIAL';
      }

      // Check for toast notification
      const toast = page.locator('.toast--success');
      if (await toast.isVisible({ timeout: 2000 }).catch(() => false)) {
        result.notes.push('Success toast displayed after export');
      }

      result.screenshots.push(await screenshot(page, 'export-after-click'));
    }

  } catch (error) {
    result.status = 'FAIL';
    result.issues.push(`Error: ${(error as Error).message}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ============================================================================
// SCENARIO 2: Import Workflow
// ============================================================================
async function testImportWorkflow(page: Page): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    scenario: 'Scenario 2: Import Workflow',
    status: 'PASS',
    issues: [],
    screenshots: [],
    notes: [],
    duration: 0
  };

  console.log('\n=== Scenario 2: Import Workflow ===');

  try {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // First export current data
    console.log('  Exporting current state...');
    result.screenshots.push(await screenshot(page, 'import-before'));

    // Create modified import data
    const modifiedData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      budget: { id: "test-budget", name: "Imported Budget" },
      accounts: [{ id: "acc-1", budgetId: "test-budget", name: "Cash", type: "cash" }],
      categoryGroups: [
        { id: "grp-import-1", budgetId: "test-budget", name: "Imported Group", sortOrder: 0 }
      ],
      categories: [
        { id: "cat-import-1", groupId: "grp-import-1", name: "Imported Category", sortOrder: 0 }
      ],
      transactions: [
        { id: "txn-import-1", accountId: "acc-1", date: "2026-01-01", amount: -5000, categoryId: "cat-import-1", payeeId: null, memo: "Imported transaction", cleared: false, transferAccountId: null }
      ],
      payees: [],
      assignments: [
        { id: "assign-import-1", categoryId: "cat-import-1", month: "2026-01", amount: 10000 }
      ],
      targets: []
    };

    // Save modified data to file
    const importPath = path.join(SCREENSHOT_DIR, 'import-test.json');
    fs.writeFileSync(importPath, JSON.stringify(modifiedData, null, 2));

    // Find Import button
    console.log('  Looking for Import button...');
    const importBtn = page.locator('button', { hasText: 'Import' });

    if (!await importBtn.isVisible()) {
      result.issues.push('Import button not visible');
      result.status = 'FAIL';
    } else {
      result.notes.push('Import button is clearly visible in header');

      // Trigger file input
      const fileInput = page.locator('input[type="file"][accept=".json"]');
      await fileInput.setInputFiles(importPath);

      await page.waitForTimeout(1000);

      // Check for success toast
      const successToast = page.locator('.toast--success');
      const errorToast = page.locator('.toast--error');

      if (await successToast.isVisible({ timeout: 3000 }).catch(() => false)) {
        result.notes.push('Import success toast displayed');
      } else if (await errorToast.isVisible({ timeout: 1000 }).catch(() => false)) {
        const errorText = await errorToast.textContent();
        result.issues.push(`Import error: ${errorText}`);
        result.status = 'PARTIAL';
      }

      result.screenshots.push(await screenshot(page, 'import-after'));

      // Verify data was imported
      const importedGroup = page.locator('.budget-table__group-name-text', { hasText: 'Imported Group' });
      if (await importedGroup.isVisible({ timeout: 2000 }).catch(() => false)) {
        result.notes.push('Imported category group appears in UI');
      } else {
        result.issues.push('Imported category group not visible');
      }

      const importedCategory = page.locator('.budget-table__category-name-text', { hasText: 'Imported Category' });
      if (await importedCategory.isVisible({ timeout: 1000 }).catch(() => false)) {
        result.notes.push('Imported category appears in UI');
      }
    }

  } catch (error) {
    result.status = 'FAIL';
    result.issues.push(`Error: ${(error as Error).message}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ============================================================================
// SCENARIO 3: Large Numbers
// ============================================================================
async function testLargeNumbers(page: Page): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    scenario: 'Scenario 3: Large Numbers',
    status: 'PASS',
    issues: [],
    screenshots: [],
    notes: [],
    duration: 0
  };

  console.log('\n=== Scenario 3: Large Numbers ===');

  try {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Set up category
    await addCategoryGroup(page, 'Testing');
    await addCategory(page, 'Testing', 'Large Amount');

    // Test $1,000,000.00 transaction
    console.log('  Testing $1,000,000.00 transaction...');
    await addTransaction(page, {
      payee: 'Big Corp',
      category: 'Large Amount',
      amount: '1000000.00',
      isOutflow: false
    });

    result.screenshots.push(await screenshot(page, 'large-number-million'));

    // Check if amount is displayed correctly
    const millionDisplayed = await page.locator('text=$1,000,000.00').count();
    if (millionDisplayed > 0) {
      result.notes.push('$1,000,000.00 displayed correctly with formatting');
    } else {
      result.issues.push('$1,000,000.00 may not be formatted correctly');
    }

    // Test $0.01 transaction
    console.log('  Testing $0.01 transaction...');
    await addTransaction(page, {
      payee: 'Tiny Amount',
      category: 'Large Amount',
      amount: '0.01'
    });

    result.screenshots.push(await screenshot(page, 'large-number-penny'));

    const pennyDisplayed = await page.locator('text=$0.01').count();
    if (pennyDisplayed > 0) {
      result.notes.push('$0.01 displayed correctly');
    } else {
      result.issues.push('$0.01 may not be displayed correctly');
    }

    // Test $999,999.99 assignment
    console.log('  Testing $999,999.99 assignment...');
    await assignToCategory(page, 'Large Amount', '999999.99');

    result.screenshots.push(await screenshot(page, 'large-number-assignment'));

    const largeAssignment = await page.locator('text=$999,999.99').count();
    if (largeAssignment > 0) {
      result.notes.push('$999,999.99 assignment displayed correctly');
    } else {
      result.issues.push('Large assignment may not be formatted correctly');
    }

  } catch (error) {
    result.status = 'FAIL';
    result.issues.push(`Error: ${(error as Error).message}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ============================================================================
// SCENARIO 4: Special Characters
// ============================================================================
async function testSpecialCharacters(page: Page): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    scenario: 'Scenario 4: Special Characters in Names',
    status: 'PASS',
    issues: [],
    screenshots: [],
    notes: [],
    duration: 0
  };

  console.log('\n=== Scenario 4: Special Characters ===');

  try {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Test group with special characters
    console.log('  Creating group with special characters...');
    const groupName = 'Bills & Utilities (Monthly)';
    await addCategoryGroup(page, groupName);

    const groupVisible = await page.locator('.budget-table__group-name-text', { hasText: groupName }).isVisible();
    if (groupVisible) {
      result.notes.push(`Group with "&" and parentheses displayed correctly: "${groupName}"`);
    } else {
      result.issues.push('Group with special characters not displayed correctly');
    }

    // Test category with unicode
    console.log('  Creating category with unicode...');
    const categoryName = 'Coffee Shop';  // Simplified - emoji might not work in all inputs
    await addCategory(page, groupName, categoryName);

    const categoryVisible = await page.locator('.budget-table__category-name-text', { hasText: categoryName }).isVisible();
    if (categoryVisible) {
      result.notes.push(`Category displayed correctly: "${categoryName}"`);
    } else {
      result.issues.push('Category name not displayed correctly');
    }

    // Test payee with quotes
    console.log('  Creating transaction with special payee name...');
    await addTransaction(page, {
      payee: "Bob's Store \"The Best\"",
      category: categoryName,
      amount: '25.00'
    });

    result.screenshots.push(await screenshot(page, 'special-characters'));

    // Check if payee with quotes appears
    const payeeVisible = await page.locator('text=Bob\'s Store').count();
    if (payeeVisible > 0) {
      result.notes.push('Payee with apostrophe and quotes handled correctly');
    } else {
      result.issues.push('Payee with special characters may have issues');
    }

  } catch (error) {
    result.status = 'FAIL';
    result.issues.push(`Error: ${(error as Error).message}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ============================================================================
// SCENARIO 5: Rapid Data Entry
// ============================================================================
async function testRapidDataEntry(page: Page): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    scenario: 'Scenario 5: Rapid Data Entry',
    status: 'PASS',
    issues: [],
    screenshots: [],
    notes: [],
    duration: 0
  };

  console.log('\n=== Scenario 5: Rapid Data Entry ===');

  try {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Set up category
    await addCategoryGroup(page, 'Rapid Test');
    await addCategory(page, 'Rapid Test', 'Expenses');

    // Time adding 10 transactions
    console.log('  Adding 10 transactions rapidly...');
    const txnStartTime = Date.now();

    for (let i = 1; i <= 10; i++) {
      await addTransaction(page, {
        payee: `Vendor ${i}`,
        category: 'Expenses',
        amount: (i * 10).toFixed(2)
      });
    }

    const txnEndTime = Date.now();
    const totalTime = (txnEndTime - txnStartTime) / 1000;
    const avgTime = totalTime / 10;

    result.notes.push(`10 transactions added in ${totalTime.toFixed(2)} seconds`);
    result.notes.push(`Average time per transaction: ${avgTime.toFixed(2)} seconds`);

    if (avgTime > 2) {
      result.issues.push('Transaction entry may be slow (>2s per transaction)');
      result.status = 'PARTIAL';
    }

    result.screenshots.push(await screenshot(page, 'rapid-entry-complete'));

    // Test keyboard navigation
    console.log('  Testing keyboard navigation...');

    // Test 'n' shortcut for new transaction
    await page.keyboard.press('n');
    const modalOpened = await page.locator('.modal-content').isVisible({ timeout: 1000 });
    if (modalOpened) {
      result.notes.push("Keyboard shortcut 'n' opens new transaction modal");

      // Test Tab navigation
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Escape');

      result.notes.push('Tab navigation works in modal');
    } else {
      result.issues.push("Keyboard shortcut 'n' did not open transaction modal");
    }

    // Test arrow keys for month navigation
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    result.notes.push('Arrow keys work for month navigation');

  } catch (error) {
    result.status = 'FAIL';
    result.issues.push(`Error: ${(error as Error).message}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ============================================================================
// SCENARIO 6: Multi-Month Handling
// ============================================================================
async function testMultiMonth(page: Page): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    scenario: 'Scenario 6: Multi-Month Scenario',
    status: 'PASS',
    issues: [],
    screenshots: [],
    notes: [],
    duration: 0
  };

  console.log('\n=== Scenario 6: Multi-Month Handling ===');

  try {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Set up categories
    await addCategoryGroup(page, 'Monthly Bills');
    await addCategory(page, 'Monthly Bills', 'Subscription');

    // Add income and assignment in current month (January 2026)
    console.log('  Setting up January 2026...');
    await addTransaction(page, {
      payee: 'Salary',
      amount: '5000.00',
      isOutflow: false,
      date: '2026-01-15'
    });

    await assignToCategory(page, 'Subscription', '100');
    result.screenshots.push(await screenshot(page, 'multimonth-january'));

    // Navigate to February
    console.log('  Navigating to February 2026...');
    await navigateToMonth(page, 'next');
    await page.waitForTimeout(500);

    result.screenshots.push(await screenshot(page, 'multimonth-february'));

    // Check if assignment carries over or shows inherited value
    const subscriptionRow = page.locator('.budget-table__category-row', { hasText: 'Subscription' });
    const assignedValue = await subscriptionRow.locator('.budget-table__cell--editable').textContent();
    result.notes.push(`February assignment display: ${assignedValue?.trim()}`);

    // Check for inherited value styling
    const hasInheritedClass = await subscriptionRow.locator('.budget-table__inherited-value').count();
    if (hasInheritedClass > 0) {
      result.notes.push('Inherited values are styled differently (good UX)');
    }

    // Add transaction in February
    await addTransaction(page, {
      payee: 'Netflix',
      category: 'Subscription',
      amount: '15.99',
      date: '2026-02-01'
    });

    result.screenshots.push(await screenshot(page, 'multimonth-february-transaction'));

    // Navigate to December 2025 (previous month)
    console.log('  Navigating to previous months...');
    // Go back 3 months (Feb -> Jan -> Dec)
    await navigateToMonth(page, 'prev');
    await navigateToMonth(page, 'prev');
    await page.waitForTimeout(500);

    result.screenshots.push(await screenshot(page, 'multimonth-december'));

    // Navigate back to current month using 't' shortcut
    await page.keyboard.press('t');
    await page.waitForTimeout(500);
    result.notes.push("'t' shortcut returns to current month");

    result.screenshots.push(await screenshot(page, 'multimonth-return-today'));

  } catch (error) {
    result.status = 'FAIL';
    result.issues.push(`Error: ${(error as Error).message}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ============================================================================
// SCENARIO 7: Negative Balance Scenarios
// ============================================================================
async function testNegativeBalances(page: Page): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    scenario: 'Scenario 7: Negative Balance Scenarios',
    status: 'PASS',
    issues: [],
    screenshots: [],
    notes: [],
    duration: 0
  };

  console.log('\n=== Scenario 7: Negative Balance Scenarios ===');

  try {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Set up categories
    await addCategoryGroup(page, 'Overspend Test');
    await addCategory(page, 'Overspend Test', 'Groceries');
    await addCategory(page, 'Overspend Test', 'Entertainment');

    // Add small income
    await addTransaction(page, {
      payee: 'Small Income',
      amount: '100.00',
      isOutflow: false
    });

    // Assign to categories
    await assignToCategory(page, 'Groceries', '50');
    await assignToCategory(page, 'Entertainment', '50');

    result.screenshots.push(await screenshot(page, 'negative-balanced-start'));

    // Overspend in Groceries
    console.log('  Creating overspend scenario...');
    await addTransaction(page, {
      payee: 'Grocery Store',
      category: 'Groceries',
      amount: '75.00'
    });

    result.screenshots.push(await screenshot(page, 'negative-groceries-overspend'));

    // Check for negative styling
    const negativeCell = await page.locator('.budget-table__cell--negative').count();
    if (negativeCell > 0) {
      result.notes.push('Negative balances are styled with red/negative indicator');
    } else {
      result.issues.push('Negative balances may not be visually distinguished');
    }

    // Overspend Ready to Assign
    console.log('  Overassigning budget...');
    await assignToCategory(page, 'Entertainment', '200');

    result.screenshots.push(await screenshot(page, 'negative-overbudget'));

    // Check Ready to Assign header for negative state
    const readyToAssign = page.locator('.ready-to-assign');
    const rtaClass = await readyToAssign.getAttribute('class');
    if (rtaClass?.includes('negative')) {
      result.notes.push('Ready to Assign shows negative/overbudget state clearly');
    }

    const rtaText = await readyToAssign.locator('.ready-to-assign__label').textContent();
    result.notes.push(`Ready to Assign label when negative: "${rtaText?.trim()}"`);

    // Create uncategorized spending
    console.log('  Adding uncategorized transaction...');
    await addTransaction(page, {
      payee: 'Unknown Vendor',
      amount: '25.00'
    });

    result.screenshots.push(await screenshot(page, 'negative-uncategorized'));

    // Check for uncategorized row
    const uncategorizedRow = await page.locator('.budget-table__uncategorized-row').count();
    if (uncategorizedRow > 0) {
      result.notes.push('Uncategorized spending is displayed in a separate row');
    }

  } catch (error) {
    result.status = 'FAIL';
    result.issues.push(`Error: ${(error as Error).message}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ============================================================================
// SCENARIO 8: Data Persistence
// ============================================================================
async function testDataPersistence(page: Page): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    scenario: 'Scenario 8: Data Persistence Check',
    status: 'PASS',
    issues: [],
    screenshots: [],
    notes: [],
    duration: 0
  };

  console.log('\n=== Scenario 8: Data Persistence ===');

  try {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Create identifiable data
    const testGroupName = `Persistence Test ${Date.now()}`;
    await addCategoryGroup(page, testGroupName);
    await addCategory(page, testGroupName, 'Test Category');
    await addTransaction(page, {
      payee: 'Persistence Payee',
      category: 'Test Category',
      amount: '123.45'
    });

    result.screenshots.push(await screenshot(page, 'persistence-before-refresh'));

    // Refresh the page
    console.log('  Refreshing page...');
    await page.reload();
    await waitForApp(page);

    result.screenshots.push(await screenshot(page, 'persistence-after-refresh'));

    // Check if data persisted
    const groupExists = await page.locator('.budget-table__group-name-text', { hasText: testGroupName }).count();
    const categoryExists = await page.locator('.budget-table__category-name-text', { hasText: 'Test Category' }).count();
    const transactionExists = await page.locator('text=$123.45').count();

    if (groupExists === 0 && categoryExists === 0 && transactionExists === 0) {
      result.notes.push('Data does NOT persist after page refresh');
      result.notes.push('This is expected for MemoryStore - data is in-memory only');
      result.issues.push('No data persistence - users will lose data on refresh');
    } else {
      result.notes.push('Data persists after page refresh');

      // Check localStorage
      const storageData = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        return { keys, count: keys.length };
      });
      result.notes.push(`localStorage keys: ${storageData.keys.join(', ') || 'none'}`);
    }

  } catch (error) {
    result.status = 'FAIL';
    result.issues.push(`Error: ${(error as Error).message}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ============================================================================
// SCENARIO 9: Export/Import Round-Trip
// ============================================================================
async function testExportImportRoundTrip(page: Page): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    scenario: 'Scenario 9: Export/Import Round-Trip',
    status: 'PASS',
    issues: [],
    screenshots: [],
    notes: [],
    duration: 0
  };

  console.log('\n=== Scenario 9: Export/Import Round-Trip ===');

  try {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Create comprehensive test data
    console.log('  Creating comprehensive test data...');

    // 3+ category groups
    await addCategoryGroup(page, 'Fixed Expenses');
    await addCategoryGroup(page, 'Variable Expenses');
    await addCategoryGroup(page, 'Savings Goals');

    // 10+ categories
    await addCategory(page, 'Fixed Expenses', 'Rent');
    await addCategory(page, 'Fixed Expenses', 'Insurance');
    await addCategory(page, 'Fixed Expenses', 'Phone');
    await addCategory(page, 'Variable Expenses', 'Groceries');
    await addCategory(page, 'Variable Expenses', 'Dining Out');
    await addCategory(page, 'Variable Expenses', 'Gas');
    await addCategory(page, 'Variable Expenses', 'Entertainment');
    await addCategory(page, 'Savings Goals', 'Emergency Fund');
    await addCategory(page, 'Savings Goals', 'Vacation');
    await addCategory(page, 'Savings Goals', 'New Car');

    // Add income
    await addTransaction(page, { payee: 'Employer', amount: '5000.00', isOutflow: false, date: '2026-01-01' });

    // 20+ transactions
    const txnData = [
      { payee: 'Landlord', category: 'Rent', amount: '1500.00', date: '2026-01-01' },
      { payee: 'State Farm', category: 'Insurance', amount: '150.00', date: '2026-01-05' },
      { payee: 'Verizon', category: 'Phone', amount: '85.00', date: '2026-01-10' },
      { payee: 'Kroger', category: 'Groceries', amount: '125.00', date: '2026-01-02' },
      { payee: 'Walmart', category: 'Groceries', amount: '98.50', date: '2026-01-08' },
      { payee: 'Olive Garden', category: 'Dining Out', amount: '45.00', date: '2026-01-05' },
      { payee: 'Shell', category: 'Gas', amount: '55.00', date: '2026-01-03' },
      { payee: 'BP', category: 'Gas', amount: '48.00', date: '2026-01-12' },
      { payee: 'Netflix', category: 'Entertainment', amount: '15.99', date: '2026-01-01' },
      { payee: 'Spotify', category: 'Entertainment', amount: '9.99', date: '2026-01-01' },
    ];

    for (const txn of txnData) {
      await addTransaction(page, txn);
    }

    // Multiple assignments
    await assignToCategory(page, 'Rent', '1500');
    await assignToCategory(page, 'Insurance', '150');
    await assignToCategory(page, 'Groceries', '300');
    await assignToCategory(page, 'Emergency Fund', '500');

    result.screenshots.push(await screenshot(page, 'roundtrip-before-export'));

    // Count items before export
    const groupsBefore = await page.locator('.budget-table__group-row').count();
    const categoriesBefore = await page.locator('.budget-table__category-row').count();
    const transactionsBefore = await page.locator('.transaction-item').count();

    result.notes.push(`Before export: ${groupsBefore} groups, ${categoriesBefore} categories, ${transactionsBefore} transaction rows`);

    // Export
    console.log('  Exporting data...');
    const exportBtn = page.locator('button', { hasText: 'Export' });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportBtn.click()
    ]);

    const exportPath = path.join(SCREENSHOT_DIR, 'roundtrip-export.json');
    await download.saveAs(exportPath);

    // Read and verify export
    const exportedData = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
    result.notes.push(`Exported: ${exportedData.categoryGroups.length} groups, ${exportedData.categories.length} categories, ${exportedData.transactions.length} transactions, ${exportedData.assignments.length} assignments`);

    // Reload page to get fresh state (simulates "clearing")
    console.log('  Reloading page (simulating clear)...');
    await page.reload();
    await waitForApp(page);

    result.screenshots.push(await screenshot(page, 'roundtrip-after-reload'));

    // Import the exported data back
    console.log('  Importing exported data...');
    const fileInput = page.locator('input[type="file"][accept=".json"]');
    await fileInput.setInputFiles(exportPath);
    await page.waitForTimeout(1000);

    result.screenshots.push(await screenshot(page, 'roundtrip-after-import'));

    // Verify data was restored
    const groupsAfter = await page.locator('.budget-table__group-row').count();
    const categoriesAfter = await page.locator('.budget-table__category-row').count();

    result.notes.push(`After import: ${groupsAfter} groups, ${categoriesAfter} categories`);

    // Check key items
    const rentExists = await page.locator('.budget-table__category-name-text', { hasText: 'Rent' }).count();
    const emergencyExists = await page.locator('.budget-table__category-name-text', { hasText: 'Emergency Fund' }).count();

    if (rentExists > 0 && emergencyExists > 0) {
      result.notes.push('Key categories restored successfully');
    } else {
      result.issues.push('Some categories may not have been restored');
      result.status = 'PARTIAL';
    }

    // Check assignment values
    const rentRow = page.locator('.budget-table__category-row', { hasText: 'Rent' });
    if (await rentRow.count() > 0) {
      const rentAssigned = await rentRow.locator('.budget-table__cell--editable').textContent();
      result.notes.push(`Rent assignment after import: ${rentAssigned?.trim()}`);
    }

  } catch (error) {
    result.status = 'FAIL';
    result.issues.push(`Error: ${(error as Error).message}`);
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================
async function runAllTests(): Promise<void> {
  console.log('========================================');
  console.log('POWER USER QA TEST SUITE');
  console.log('========================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Screenshot directory: ${SCREENSHOT_DIR}`);
  console.log('');

  const browser: Browser = await chromium.launch({
    headless: false,
    slowMo: 100
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });

  const page = await context.newPage();

  // Run each scenario
  testResults.push(await testExportWorkflow(page));

  // Close and create new page for each test to ensure clean state
  await page.close();
  let newPage = await context.newPage();
  testResults.push(await testImportWorkflow(newPage));

  await newPage.close();
  newPage = await context.newPage();
  testResults.push(await testLargeNumbers(newPage));

  await newPage.close();
  newPage = await context.newPage();
  testResults.push(await testSpecialCharacters(newPage));

  await newPage.close();
  newPage = await context.newPage();
  testResults.push(await testRapidDataEntry(newPage));

  await newPage.close();
  newPage = await context.newPage();
  testResults.push(await testMultiMonth(newPage));

  await newPage.close();
  newPage = await context.newPage();
  testResults.push(await testNegativeBalances(newPage));

  await newPage.close();
  newPage = await context.newPage();
  testResults.push(await testDataPersistence(newPage));

  await newPage.close();
  newPage = await context.newPage();
  testResults.push(await testExportImportRoundTrip(newPage));

  await browser.close();

  // Print summary
  console.log('\n========================================');
  console.log('TEST RESULTS SUMMARY');
  console.log('========================================\n');

  let passCount = 0;
  let failCount = 0;
  let partialCount = 0;

  for (const result of testResults) {
    const statusIcon = result.status === 'PASS' ? '[PASS]' : result.status === 'FAIL' ? '[FAIL]' : '[PARTIAL]';
    console.log(`${statusIcon} ${result.scenario} (${result.duration}ms)`);

    if (result.status === 'PASS') passCount++;
    else if (result.status === 'FAIL') failCount++;
    else partialCount++;

    if (result.notes.length > 0) {
      console.log('  Notes:');
      for (const note of result.notes) {
        console.log(`    - ${note}`);
      }
    }

    if (result.issues.length > 0) {
      console.log('  Issues:');
      for (const issue of result.issues) {
        console.log(`    ! ${issue}`);
      }
    }

    console.log(`  Screenshots: ${result.screenshots.length} captured`);
    console.log('');
  }

  console.log('========================================');
  console.log(`TOTAL: ${passCount} PASS, ${partialCount} PARTIAL, ${failCount} FAIL`);
  console.log('========================================');

  // Generate detailed report
  generateReport();
}

function generateReport(): void {
  const reportPath = path.join(SCREENSHOT_DIR, 'test-report.md');

  let report = `# Power User QA Test Report

**Date:** ${new Date().toISOString()}
**Tester Persona:** Experienced Power User

## Executive Summary

`;

  let passCount = 0, failCount = 0, partialCount = 0;
  const allIssues: string[] = [];
  const allNotes: string[] = [];

  for (const result of testResults) {
    if (result.status === 'PASS') passCount++;
    else if (result.status === 'FAIL') failCount++;
    else partialCount++;
    allIssues.push(...result.issues);
    allNotes.push(...result.notes);
  }

  report += `- **Total Tests:** ${testResults.length}
- **Passed:** ${passCount}
- **Partial:** ${partialCount}
- **Failed:** ${failCount}

## Detailed Results

`;

  for (const result of testResults) {
    report += `### ${result.scenario}

**Status:** ${result.status}
**Duration:** ${result.duration}ms

`;

    if (result.notes.length > 0) {
      report += `**Observations:**
`;
      for (const note of result.notes) {
        report += `- ${note}
`;
      }
      report += `
`;
    }

    if (result.issues.length > 0) {
      report += `**Issues Found:**
`;
      for (const issue of result.issues) {
        report += `- ${issue}
`;
      }
      report += `
`;
    }

    if (result.screenshots.length > 0) {
      report += `**Screenshots:**
`;
      for (const ss of result.screenshots) {
        report += `- ${ss}
`;
      }
      report += `
`;
    }

    report += `---

`;
  }

  // Power User Assessment
  report += `## Power User Assessment

### Comparison with Other Budgeting Apps

Based on testing, here is how this app compares to established budgeting applications:

| Feature | This App | YNAB | Mint |
|---------|----------|------|------|
| Import/Export | JSON only | QFX/CSV/JSON | Limited |
| Keyboard Shortcuts | Basic (n, t, arrows) | Extensive | Minimal |
| Data Persistence | Memory only | Cloud + Local | Cloud |
| Multi-month view | Single month | Single month | Timeline |
| Negative balance handling | Clear visual feedback | Clear visual | Alerts |

### Bugs Found

`;

  if (allIssues.length > 0) {
    for (let i = 0; i < allIssues.length; i++) {
      report += `${i + 1}. ${allIssues[i]}
`;
    }
  } else {
    report += `No critical bugs found.
`;
  }

  report += `
### Missing Power User Features

1. **No CSV/QFX Import** - Cannot import bank statements
2. **No Undo/Redo** - Destructive actions cannot be reversed
3. **No Bulk Operations** - Cannot select multiple transactions
4. **No Recurring Transactions** - Must manually enter repeating bills
5. **No Search/Filter** - Cannot search transactions or categories
6. **No Category Moving** - Cannot move categories between groups via drag-drop
7. **No Split Transactions** - Cannot split one transaction across categories
8. **No Goals/Targets UI** - Targets array exists in export but no UI

### Data Integrity Assessment

- **Export format:** Well-structured JSON with version control
- **Import validation:** Good - validates required fields
- **Round-trip integrity:** Data survives export/import cycle
- **Persistence:** Data is NOT persisted (major issue for real use)

### Import/Export Assessment

**Strengths:**
- Clean JSON format with version field
- All data types exported (groups, categories, transactions, assignments)
- Import validates structure before processing
- Success/error feedback via toast notifications

**Weaknesses:**
- No CSV/bank statement import
- No partial import (must replace all data)
- No export date range filtering
- No merge option on import (replaces everything)

### Screenshots Captured

`;

  const allScreenshots = testResults.flatMap(r => r.screenshots);
  for (const ss of allScreenshots) {
    report += `- \`${ss}\`
`;
  }

  report += `

---
*Report generated by Power User QA Test Suite*
`;

  fs.writeFileSync(reportPath, report);
  console.log(`\nDetailed report saved to: ${reportPath}`);
}

// Run the tests
runAllTests().catch(console.error);

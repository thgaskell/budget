Feature: Category Balance Carryover
  As a budget user
  I want my unspent category balances to carry over to the next month
  So that I can save money in categories for future use

  Background:
    Given I am using an in-memory store
    And a budget named "Test Budget" exists
    And "Test Budget" is the active budget
    And an account named "Checking" of type "checking" exists
    And a category group named "Expenses" exists
    And a category named "Groceries" in group "Expenses" exists
    And a category named "Dining" in group "Expenses" exists
    And a category group named "Savings" exists
    And a category named "Vacation" in group "Savings" exists
    And a transaction of $5000 in "Checking" from "Employer" on "2024-12-01"

  Scenario: Category balance carries over to next month (positive carryover)
    Given I run "budget assign 'Groceries' 500 --month 2024-12"
    And a transaction of -$400 in "Checking" from "Grocery Store" for category "Groceries" on "2024-12-15"
    When I run "budget status --month 2025-01"
    Then the command should succeed
    And the output should contain "Groceries"
    And the output should contain "$100.00"

  Scenario: Overspending carries over as debt (negative carryover)
    Given I run "budget assign 'Dining' 200 --month 2024-12"
    And a transaction of -$250 in "Checking" from "Restaurant" for category "Dining" on "2024-12-20"
    When I run "budget status --month 2025-01"
    Then the command should succeed
    And the output should contain "Dining"
    And the output should contain "-$50.00"

  Scenario: Carryover accumulates across multiple months
    Given I run "budget assign 'Vacation' 100 --month 2024-10"
    And I run "budget assign 'Vacation' 100 --month 2024-11"
    And I run "budget assign 'Vacation' 100 --month 2024-12"
    When I run "budget status --month 2025-01"
    Then the command should succeed
    And the output should contain "Vacation"
    And the output should contain "$300.00"

  Scenario: Carryover combines with current month assignment
    Given I run "budget assign 'Groceries' 500 --month 2024-12"
    And a transaction of -$400 in "Checking" from "Grocery Store" for category "Groceries" on "2024-12-15"
    And I run "budget assign 'Groceries' 500 --month 2025-01"
    When I run "budget status --month 2025-01"
    Then the command should succeed
    And the output should contain "Groceries"
    And the output should contain "$500.00"
    And the output should contain "$600.00"

  Scenario: JSON output includes carryover in available
    Given I run "budget assign 'Groceries' 500 --month 2024-12"
    And a transaction of -$300 in "Checking" from "Grocery Store" for category "Groceries" on "2024-12-15"
    When I run "budget status --month 2025-01 --json"
    Then the output should be valid JSON
    And the output should contain "200"

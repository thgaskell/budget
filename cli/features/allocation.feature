Feature: Budget Allocation
  As a user with income
  I want to assign money to categories
  So that I can budget my spending

  Background:
    Given I am using an in-memory store
    And a budget named "Test Budget" exists
    And "Test Budget" is the active budget
    And an account named "Checking" of type "checking" exists
    And a category group named "Expenses" exists
    And a category named "Groceries" in group "Expenses" exists
    And a category named "Utilities" in group "Expenses" exists
    And a transaction of $3000 in "Checking" from "Employer"

  Scenario: Assign money to a category
    When I run "budget assign 'Groceries' 500"
    Then the command should succeed
    And the output should contain "Assigned $500.00 to Groceries"

  Scenario: Move money between categories
    Given I run "budget assign 'Groceries' 500"
    When I run "budget move 'Groceries' 'Utilities' 100"
    Then the command should succeed
    And the output should contain "Moved $100.00"
    And the output should contain "from Groceries"
    And the output should contain "to Utilities"

  Scenario: Check available (Ready to Assign)
    When I run "budget available"
    Then the command should succeed
    And the output should contain "Ready to Assign"
    And the output should contain "$3,000.00"

  Scenario: Check available after assignment
    Given I run "budget assign 'Groceries' 1000"
    When I run "budget available"
    Then the output should contain "$2,000.00"

  Scenario: Show budget status
    Given I run "budget assign 'Groceries' 500"
    And I run "budget assign 'Utilities' 200"
    When I run "budget status"
    Then the output should contain "Budget Status"
    And the output should contain "Groceries"
    And the output should contain "Utilities"
    And the output should contain "$500.00"
    And the output should contain "$200.00"

  Scenario: Show category activity after spending
    Given I run "budget assign 'Groceries' 500"
    And a transaction of -$75 in "Checking" from "Grocery Store" for category "Groceries"
    When I run "budget status"
    Then the output should contain "Groceries"
    And the output should contain "$500.00"
    And the output should contain "-$75.00"
    And the output should contain "$425.00"

  Scenario: JSON output for available
    When I run "budget available --json"
    Then the output should be valid JSON
    And the JSON should contain "readyToAssign"

  Scenario: JSON output for status
    When I run "budget status --json"
    Then the output should be valid JSON

  Scenario: Ready to Assign unchanged after categorized expenses
    Given I run "budget assign 'Groceries' 1000"
    And I run "budget assign 'Utilities' 500"
    When I run "budget available"
    Then the output should contain "$1,500.00"
    Given a transaction of -$400 in "Checking" from "Grocery Store" for category "Groceries"
    When I run "budget available"
    Then the output should contain "$1,500.00"
    When I run "budget status"
    Then the output should contain "Ready to Assign"
    And the output should contain "$1,500.00"

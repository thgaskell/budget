Feature: Account Management
  As a user with a budget
  I want to manage my accounts
  So that I can track where my money is

  Background:
    Given I am using an in-memory store
    And a budget named "Test Budget" exists
    And "Test Budget" is the active budget

  Scenario: Add a checking account
    When I run "budget account add 'Checking' --type checking"
    Then the command should succeed
    And the output should contain "Created account: Checking"

  Scenario: Add a savings account
    When I run "budget account add 'Savings' --type savings"
    Then the command should succeed
    And the output should contain "Created account: Savings"

  Scenario: Add a credit card account
    When I run "budget account add 'Credit Card' --type credit"
    Then the command should succeed
    And the output should contain "Created account: Credit Card"

  Scenario: Add a tracking account
    When I run "budget account add 'Investment' --type tracking"
    Then the command should succeed
    And the output should contain "Created account: Investment"

  Scenario: List accounts
    Given an account named "Checking" of type "checking" exists
    And an account named "Savings" of type "savings" exists
    When I run "budget account list"
    Then the output should contain "Checking"
    And the output should contain "Savings"

  Scenario: List accounts with balances
    Given an account named "Checking" of type "checking" exists
    And a transaction of $1000 in "Checking" from "Employer"
    When I run "budget account list"
    Then the output should contain "Checking"
    And the output should contain "$1,000.00"

  Scenario: Show account details
    Given an account named "Checking" of type "checking" exists
    When I run "budget account show 'Checking'"
    Then the output should contain "Checking"
    And the output should contain "checking"
    And the output should contain "On Budget"

  Scenario: Delete an account
    Given an account named "Delete Me" of type "checking" exists
    And I capture the account ID for "Delete Me"
    When I run "budget account delete <captured-id>"
    Then the command should succeed
    And the output should contain "Deleted account"

  Scenario: JSON output for account list
    Given an account named "JSON Test" of type "checking" exists
    When I run "budget account list --json"
    Then the output should be valid JSON
    And the JSON should contain "JSON Test"

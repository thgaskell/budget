Feature: Transaction Management
  As a user with accounts
  I want to record transactions
  So that I can track my spending and income

  Background:
    Given I am using an in-memory store
    And a budget named "Test Budget" exists
    And "Test Budget" is the active budget
    And an account named "Checking" of type "checking" exists

  Scenario: Add an income transaction
    When I run "budget tx add --account 'Checking' --amount 3000 --payee 'Employer'"
    Then the command should succeed
    And the output should contain "$3,000.00"
    And the output should contain "Employer"

  Scenario: Add an expense transaction
    When I run "budget tx add --account 'Checking' --amount -75.50 --payee 'Grocery Store'"
    Then the command should succeed
    And the output should contain "-$75.50"

  Scenario: Add a transaction with a date
    When I run "budget tx add --account 'Checking' --amount 100 --payee 'Test' --date '2025-01-15'"
    Then the command should succeed

  Scenario: Add a transaction with a memo
    When I run "budget tx add --account 'Checking' --amount 50 --payee 'Test' --memo 'Weekly allowance'"
    Then the command should succeed

  Scenario: Add a cleared transaction
    When I run "budget tx add --account 'Checking' --amount 100 --payee 'Test' --cleared"
    Then the command should succeed

  Scenario: List transactions
    Given a transaction of $1000 in "Checking" from "Employer"
    And a transaction of -$50 in "Checking" from "Coffee Shop"
    When I run "budget tx list"
    Then the output should contain "Employer"
    And the output should contain "Coffee Shop"

  Scenario: List transactions for specific account
    Given an account named "Savings" of type "savings" exists
    And a transaction of $1000 in "Checking" from "Employer"
    And a transaction of $500 in "Savings" from "Transfer"
    When I run "budget tx list --account 'Checking'"
    Then the output should contain "Employer"
    And the output should not contain "Transfer"

  Scenario: Show transaction details
    Given a transaction of $1000 in "Checking" from "Employer"
    And I capture the last transaction ID
    When I run "budget tx show <captured-id>"
    Then the output should contain "Employer"
    And the output should contain "$1,000.00"

  Scenario: Delete a transaction
    Given a transaction of $100 in "Checking" from "Test"
    And I capture the last transaction ID
    When I run "budget tx delete <captured-id>"
    Then the command should succeed
    And the output should contain "Transaction deleted"

  Scenario: Transfer money between two on-budget accounts
    Given an account named "Savings" of type "savings" exists
    And a transaction of $3000 in "Checking" from "Employer"
    When I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 500"
    Then the command should succeed
    And the output should contain "Transferred $500.00 from Checking to Savings"

  Scenario: A transfer does not inflate Ready to Assign
    Given an account named "Savings" of type "savings" exists
    And a transaction of $3000 in "Checking" from "Employer"
    When I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 500"
    And I run "budget available"
    Then the output should contain "$3,000.00"
    And the output should not contain "$3,500.00"

  Scenario: A credit card payment does not inflate Ready to Assign
    Given an account named "Visa" of type "credit" exists
    And a transaction of $1000 in "Checking" from "Employer"
    When I run "budget tx transfer --from 'Checking' --to 'Visa' --amount 100"
    And I run "budget available"
    Then the output should contain "$1,000.00"
    And the output should not contain "$1,100.00"

  Scenario: Show a transfer
    Given an account named "Savings" of type "savings" exists
    And I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 500"
    And I capture the last transaction ID in "Savings"
    When I run "budget tx show <captured-id>"
    Then the output should contain "Transfer: Checking"

  Scenario: Deleting one leg of a transfer deletes both
    Given an account named "Savings" of type "savings" exists
    And I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 500"
    And I capture the last transaction ID in "Savings"
    When I run "budget tx delete <captured-id>"
    Then the command should succeed
    And the output should contain "Transaction deleted"
    And I run "budget tx list"
    And the output should contain "No transactions found."

  Scenario: Link two existing transactions as a transfer
    Given an account named "Savings" of type "savings" exists
    And a transaction of $3000 in "Checking" from "Employer"
    And a transaction of -$500 in "Checking" from "Transfer"
    And I capture the last transaction ID as "outflow"
    And a transaction of $500 in "Savings" from "Transfer"
    And I capture the last transaction ID as "inflow"
    When I run "budget available"
    Then the output should contain "$3,500.00"
    When I run "budget tx link <id:outflow> <id:inflow>"
    Then the command should succeed
    And the output should contain "Linked transfer between Checking and Savings"
    When I run "budget available"
    Then the output should contain "$3,000.00"

  Scenario: Unlink a transfer
    Given an account named "Savings" of type "savings" exists
    And I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 500"
    And I capture the last transaction ID in "Savings"
    When I run "budget tx unlink <captured-id>"
    Then the command should succeed
    And the output should contain "Unlinked transfer on both transactions"
    And I run "budget available"
    And the output should contain "$500.00"

  Scenario: JSON output includes the transfer link
    Given an account named "Savings" of type "savings" exists
    And I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 500"
    When I run "budget tx list --json"
    Then the output should be valid JSON
    And the JSON should contain "transferAccountId"

  Scenario: JSON output for transaction list
    Given a transaction of $1000 in "Checking" from "JSON Test"
    When I run "budget tx list --json"
    Then the output should be valid JSON

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

  Scenario: Editing one leg of a transfer keeps both legs in step
    Given an account named "Savings" of type "savings" exists
    And a transaction of $3000 in "Checking" from "Employer"
    And I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 500"
    And I capture the last transaction ID in "Savings"
    When I run "budget tx edit <captured-id> --amount 900"
    Then the command should succeed
    And I run "budget tx list"
    And the output should contain "-$900.00"
    And I run "budget account list"
    And the output should contain "$2,100.00"
    And I run "budget available"
    And the output should contain "$3,000.00"

  Scenario: Categorising the inflow leg of an on-budget transfer is refused
    Given an account named "Savings" of type "savings" exists
    And a category group named "Expenses" exists
    And a category named "Groceries" in group "Expenses" exists
    And I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 500"
    And I capture the last transaction ID in "Savings"
    When I run "budget tx edit <captured-id> --category 'Groceries'"
    Then the command should fail
    And the output should contain "exactly one account is off-budget"

  Scenario: Linking two transactions that do not offset is refused
    Given an account named "Savings" of type "savings" exists
    And a transaction of -$100 in "Checking" from "Outflow"
    And I capture the last transaction ID as "outflow"
    And a transaction of $250 in "Savings" from "Income"
    And I capture the last transaction ID as "inflow"
    When I run "budget tx link <id:outflow> <id:inflow>"
    Then the command should fail
    And the output should contain "must offset exactly"
    When I run "budget available"
    Then the output should contain "$250.00"

  Scenario: JSON output includes the transfer link
    Given an account named "Savings" of type "savings" exists
    And I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 500"
    When I run "budget tx list --json"
    Then the output should be valid JSON
    And the JSON should contain "transferAccountId"
    And the JSON should contain "transferId"

  Scenario: JSON output for transaction list
    Given a transaction of $1000 in "Checking" from "JSON Test"
    When I run "budget tx list --json"
    Then the output should be valid JSON

  Scenario: Deleting one of two identical transfers leaves the other alone
    Given an account named "Savings" of type "savings" exists
    And I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 50"
    And I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 50"
    And I capture the last transaction ID in "Savings"
    When I run "budget tx delete <captured-id>"
    Then the command should succeed
    And I run "budget tx list --account 'Checking'"
    And the output should contain "-$50.00"
    And I run "budget tx list --account 'Savings'"
    And the output should contain "$50.00"
    And I run "budget available"
    And the output should contain "$0.00"

  Scenario: Editing a transfer leg whose other leg was never recorded is refused
    Given an account named "Savings" of type "savings" exists
    And I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 500"
    And no transfer partners are recorded in the database
    And I capture the last transaction ID in "Savings"
    When I run "budget tx edit <captured-id> --amount 900"
    Then the command should fail
    And the output should contain "other leg is not recorded"
    And the output should contain "tx unlink"
    And the output should contain "tx link"
    And I run "budget tx list"
    And the output should contain "$500.00"

  Scenario: Deleting a transfer leg whose other leg was never recorded is refused
    Given an account named "Savings" of type "savings" exists
    And I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 500"
    And no transfer partners are recorded in the database
    And I capture the last transaction ID in "Savings"
    When I run "budget tx delete <captured-id>"
    Then the command should fail
    And the output should contain "other leg is not recorded"
    And I run "budget tx list"
    And the output should contain "$500.00"
    And the output should contain "-$500.00"

  Scenario: Relinking a transfer whose legs were never paired by id
    Given an account named "Savings" of type "savings" exists
    And I run "budget tx transfer --from 'Checking' --to 'Savings' --amount 500"
    And no transfer partners are recorded in the database
    And I capture the last transaction ID in "Checking"
    And I capture the last transaction ID as "outflow"
    And I capture the last transaction ID in "Savings"
    And I capture the last transaction ID as "inflow"
    When I run "budget tx unlink <id:outflow>"
    Then the command should succeed
    And the output should contain "Unlinked transfer on this transaction (its other leg was not recorded)"
    When I run "budget tx unlink <id:inflow>"
    Then the command should succeed
    When I run "budget tx link <id:outflow> <id:inflow>"
    Then the command should succeed
    And the output should contain "Linked transfer between Checking and Savings"
    When I run "budget tx edit <id:inflow> --amount 900"
    Then the command should succeed
    And I run "budget tx list"
    And the output should contain "-$900.00"

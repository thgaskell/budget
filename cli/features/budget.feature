Feature: Budget Management
  As a user
  I want to manage my budgets
  So that I can organize my finances

  Background:
    Given I am using an in-memory store

  Scenario: Create a new budget
    When I run "budget create 'Home Budget'"
    Then the command should succeed
    And the output should contain "Created budget: Home Budget"

  Scenario: Create a budget with custom currency
    When I run "budget create 'Euro Budget' --currency EUR"
    Then the command should succeed
    And the output should contain "Created budget: Euro Budget"

  Scenario: Show budget details
    Given a budget named "Home Budget" exists
    When I run "budget show"
    Then the output should contain "Home Budget"
    And the output should contain "USD"

  Scenario: Show error when no budget in file
    When I run "budget show"
    Then the command should fail
    And the output should contain "No budget found in this file"

  Scenario: Delete a budget
    Given a budget named "Delete Me" exists
    And I capture the budget ID for "Delete Me"
    When I run "budget delete <captured-id>"
    Then the command should succeed
    And the output should contain "Deleted budget"

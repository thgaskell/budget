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

  Scenario: List all budgets
    Given a budget named "Home" exists
    And a budget named "Business" exists
    When I run "budget list"
    Then the output should contain "Home"
    And the output should contain "Business"

  Scenario: List budgets when none exist
    When I run "budget list"
    Then the output should contain "No budgets found"

  Scenario: Select active budget by name
    Given a budget named "Home Budget" exists
    When I run "budget use 'Home Budget'"
    Then the command should succeed
    And the output should contain "Now using budget: Home Budget"

  Scenario: Show active budget details
    Given a budget named "Home Budget" exists
    And "Home Budget" is the active budget
    When I run "budget show"
    Then the output should contain "Home Budget"
    And the output should contain "USD"

  Scenario: Show error when no active budget
    When I run "budget show"
    Then the command should fail
    And the output should contain "No active budget"

  Scenario: Delete a budget
    Given a budget named "Delete Me" exists
    And I capture the budget ID for "Delete Me"
    When I run "budget delete <captured-id>"
    Then the command should succeed
    And the output should contain "Deleted budget"

  Scenario: JSON output for budget list
    Given a budget named "Test Budget" exists
    When I run "budget list --json"
    Then the output should be valid JSON
    And the JSON should contain "Test Budget"

  Scenario: Quiet output for budget list
    Given a budget named "Quiet Test" exists
    When I run "budget list --quiet"
    Then the output should be a UUID

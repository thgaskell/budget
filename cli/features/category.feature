Feature: Category Management
  As a user
  I want to organize my spending into categories
  So that I can budget and track expenses

  Background:
    Given I am using an in-memory store
    And a budget named "Test Budget" exists
    And "Test Budget" is the active budget

  Scenario: Create a category group
    When I run "budget group add 'Monthly Bills'"
    Then the command should succeed
    And the output should contain "Created category group: Monthly Bills"

  Scenario: List category groups
    Given a category group named "Monthly Bills" exists
    And a category group named "Savings Goals" exists
    When I run "budget group list"
    Then the output should contain "Monthly Bills"
    And the output should contain "Savings Goals"

  Scenario: Delete a category group
    Given a category group named "Delete Me" exists
    And I capture the group ID for "Delete Me"
    When I run "budget group delete <captured-id> --force"
    Then the command should succeed
    And the output should contain "Deleted category group"

  Scenario: Create a category in a group
    Given a category group named "Monthly Bills" exists
    When I run "budget category add 'Rent' --group 'Monthly Bills'"
    Then the command should succeed
    And the output should contain "Created category: Rent"

  Scenario: List categories by group
    Given a category group named "Monthly Bills" exists
    And a category named "Rent" in group "Monthly Bills" exists
    And a category named "Utilities" in group "Monthly Bills" exists
    When I run "budget category list"
    Then the output should contain "Monthly Bills"
    And the output should contain "Rent"
    And the output should contain "Utilities"

  Scenario: Delete a category
    Given a category group named "Test Group" exists
    And a category named "Delete Me" in group "Test Group" exists
    And I capture the category ID for "Delete Me"
    When I run "budget category delete <captured-id>"
    Then the command should succeed
    And the output should contain "Deleted category"

  Scenario: JSON output for category list
    Given a category group named "Test Group" exists
    And a category named "Test Category" in group "Test Group" exists
    When I run "budget category list --json"
    Then the output should be valid JSON
    And the JSON should contain "Test Category"

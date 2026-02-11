Feature: Database Management
  As a user
  I want to control where my budget data is stored
  So that I can manage my database files

  Background:
    Given I am using an in-memory store

  Scenario: CLI uses SQLite store by default
    When I run "budget create 'DB Test Budget'"
    Then the command should succeed
    And the output should contain "Created budget: DB Test Budget"

  Scenario: Budget data persists between commands
    When I run "budget create 'Persistent Budget'"
    And I run "budget show"
    Then the command should succeed
    And the output should contain "Persistent Budget"

  Scenario: Only one budget per file is allowed
    When I run "budget create 'First Budget'"
    And I run "budget create 'Second Budget'"
    Then the command should fail
    And the output should contain "Only one budget per .budget file is allowed"

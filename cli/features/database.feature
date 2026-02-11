Feature: Database Management
  As a user
  I want to control where my budget data is stored
  So that I can manage my database files

  Background:
    Given I am using an in-memory store

  Scenario: CLI uses SQLite store by default
    When I run "budget create dbtest"
    Then the command should succeed
    And the output should contain "Created budget: dbtest"

  Scenario: Budget data persists between commands
    When I run "budget create persistent --name 'Persistent Budget'"
    And I run "budget show"
    Then the command should succeed
    And the output should contain "Persistent Budget"

  Scenario: Only one budget per file is allowed
    When I run "budget create first --name 'First Budget'"
    And I run "budget create second --name 'Second Budget'"
    Then the command should fail
    And the output should contain "Only one budget per .budget file is allowed"

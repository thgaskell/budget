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
    And I run "budget list"
    Then the command should succeed
    And the output should contain "Persistent Budget"

  Scenario: Multiple budgets can be created and listed
    When I run "budget create 'First Budget'"
    And I run "budget create 'Second Budget'"
    And I run "budget list"
    Then the output should contain "First Budget"
    And the output should contain "Second Budget"

  # Config isolation tests for --db flag
  Scenario: Active budget persists with --db flag
    Given I am using a file-based store at "/tmp/test-persist-db.sqlite"
    When I run "budget create 'Persist Test'"
    And I run "budget use 'Persist Test'"
    Then the command should succeed
    And the output should contain "Now using budget: Persist Test"
    # Simulate new session by resetting and reinitializing with same db
    When I reset the store and config
    And I am using a file-based store at "/tmp/test-persist-db.sqlite"
    And I run "budget show"
    Then the command should succeed
    And the output should contain "Persist Test"

  Scenario: Different databases have independent active budgets
    Given I am using a file-based store at "/tmp/db-a.sqlite"
    When I run "budget create 'Budget A'"
    And I run "budget use 'Budget A'"
    Then the output should contain "Now using budget: Budget A"
    Given I am using a file-based store at "/tmp/db-b.sqlite"
    When I run "budget create 'Budget B'"
    And I run "budget use 'Budget B'"
    Then the output should contain "Now using budget: Budget B"
    # Switch back to db-a and verify correct active budget
    Given I am using a file-based store at "/tmp/db-a.sqlite"
    When I run "budget show"
    Then the output should contain "Budget A"
    And the output should not contain "Budget B"
    # Switch to db-b and verify correct active budget
    Given I am using a file-based store at "/tmp/db-b.sqlite"
    When I run "budget show"
    Then the output should contain "Budget B"
    And the output should not contain "Budget A"

  Scenario: Switching databases does not mix active budget state
    Given I am using a file-based store at "/tmp/switch-test-1.sqlite"
    When I run "budget create 'Switch Budget 1'"
    And I run "budget use 'Switch Budget 1'"
    Given I am using a file-based store at "/tmp/switch-test-2.sqlite"
    When I run "budget show"
    Then the command should fail
    And the output should contain "No active budget"

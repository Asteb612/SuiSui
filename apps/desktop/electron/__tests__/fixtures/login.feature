Feature: Login

  Background:
    Given the application is running
    And a user account exists

  Scenario: Valid login
    When I log in with valid credentials
    Then I should see the dashboard

  Scenario: Invalid login is rejected
    When I log in with invalid credentials
    Then I should see the dashboard
    And I should see a welcome banner

@auth
Feature: User login

  Background:
    Given I am on the "/login" page

  @smoke
  Scenario: Successful login
    When I fill "username" with "admin"
    Then I should see "Welcome"

  Scenario: Failed login with a bad password
    When I fill "username" with "admin"
    Then I should see "Invalid credentials"

  @edge
  Scenario Outline: Login as <role>
    When I fill "role" with "<role>"
    Then I should see "Welcome"

    Examples:
      | role       |
      | supervisor |
      | auditor    |

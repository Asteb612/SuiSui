@auth
Feature: User login

  Background:
    Given I am on the "/login" page

  @smoke @critical
  Scenario: Successful login
    When I fill "username" with "admin"
    Then I should see "Welcome"

  Scenario: Failed login
    Then I should see "Invalid credentials"

  @Smoke
  Scenario: Case sensitive tag check
    Then I should see "Welcome"

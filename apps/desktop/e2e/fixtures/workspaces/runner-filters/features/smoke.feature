@smoke
Feature: Smoke checks

  Scenario: The app boots
    Given I am on the "home" page
    Then I should see "Welcome"

  Scenario: The header is present
    Given I am on the "home" page
    Then I should see "Menu"

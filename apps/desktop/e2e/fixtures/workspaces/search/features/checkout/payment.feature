@billing
Feature: Payment checkout

  @smoke
  Scenario: Successful login
    Given I am on the "/checkout" page
    Then I should see "Payment"

  Scenario: Page de Connexion
    Given I am on the "/connexion" page
    Then I should see "Connexion"

  @orphan
  Scenario:
    Given I am on the "/checkout" page

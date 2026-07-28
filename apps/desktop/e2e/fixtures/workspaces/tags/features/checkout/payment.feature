@billing @smoke
Feature: Payment checkout

  @smoke
  Scenario: Pay by card
    Given I am on the "/checkout" page

  Scenario: Pay by transfer
    Given I am on the "/checkout" page

  @smoke-test
  Scenario: Prefix collision guard
    Given I am on the "/checkout" page

@checkout @regression
Feature: Basket and checkout

  As a customer
  I want to buy items
  So that I receive them

  Background:
    Given I am on the "home" page
    And I am logged in as "customer"

  @smoke
  Scenario: Add a single item
    When I click on "Add to basket"
    Then I should see "1 item"

  Scenario: Fill the delivery form
    When I fill in the form with the following data:
      | Field | Value    |
      | Name  | John Doe |
      | City  | Paris    |
    Then I should see "Confirm"

  @outline
  Scenario Outline: Checkout with several quantities
    When I fill "quantity" with "<qty>"
    Then the URL should contain "<page>"

    Examples:
      | qty | page     |
      | 1   | basket   |
      | 12  | checkout |

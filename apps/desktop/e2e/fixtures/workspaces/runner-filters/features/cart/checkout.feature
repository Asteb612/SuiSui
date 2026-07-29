Feature: Checkout

  @smoke
  Scenario: Pay by card
    Given I am on the "cart" page
    When I click on "#pay"
    Then I should see "Order confirmed"

  Scenario: Cancel the order
    Given I am on the "cart" page
    When I click on "#cancel"
    Then I should see "Cancelled"

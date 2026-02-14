Feature: Checkout

  Scenario: Add item to cart
    Given I am logged in as "shopper"
    And I am on the "products" page
    When I click on ".add-to-cart"
    Then I should see "Item added"

  Scenario: Complete checkout
    Given I am logged in as "shopper"
    And I am on the "cart" page
    When I click on "#checkout-btn"
    And I fill "#card-number" with "4242424242424242"
    And I click on "#pay-btn"
    Then I should see "Order confirmed"
    And the URL should contain "/confirmation"

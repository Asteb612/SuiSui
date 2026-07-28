Feature: Checkout

  Scenario Outline: Buying <count> items
    Given a cart with <count> items
    When I check out
    Then the order total is <total>

    Examples:
      | count | total |
      | 1     | 10    |
      | 3     | 30    |

  Scenario: Slow checkout
    Given a cart with 2 items
    When I wait a while
    Then the order total is 20

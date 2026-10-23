# Reminders Card

A Home Assistant Lovelace card that lists reminders held by a sensor and lets you acknowledge them. It uses the active Home Assistant theme, so it matches the native cards in both light and dark themes.

## Installation

### HACS (custom repository)

1. In HACS, open the menu and choose **Custom repositories**.
2. Add `https://github.com/gsyates1/reminders_card` with the category **Dashboard**.
3. Install **Reminders Card** and reload the browser.

### Manual

1. Copy `reminders-card.js` to `<config>/www/reminders-card.js`.
2. Go to **Settings > Dashboards > Resources** and add `/local/reminders-card.js` as a **JavaScript module**.
3. Reload the browser.

## Data

The card reads the `reminders` attribute of the sensor you select. The attribute must be a dictionary of `unique_id` to reminder text:

```json
{
  "1": "This is a reminder.",
  "2": "Another reminder."
}
```

## Actions

| Button | Event fired | Event data |
| --- | --- | --- |
| Check icon on a reminder line | `acknowledge_reminder` | `unique_id: <id of that reminder>` |
| **All** | `acknowledge_all` | none |

Your sensor (or an automation) is expected to remove the acknowledged reminders from the `reminders` attribute. The card hides an acknowledged reminder straight away and redraws from the sensor as soon as its state changes. If the sensor still lists the reminder after 10 seconds, it is shown again.

Home Assistant only lets **administrator** users fire events from the frontend. For a non-admin user the buttons show an error notification.

## Configuration

Add the card from the dashboard editor (search for "Reminders Card") and pick the sensor, or use YAML:

```yaml
type: custom:reminders-card
entity: sensor.reminders
```

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `entity` | yes | | Sensor whose `reminders` attribute holds the reminders. |
| `title` | no | none | Header shown above the list. |
| `list_height` | no | `250px` | Height of the reminder list (any CSS length). In a sections view the list also stretches or shrinks to fill the card's grid size. |

Reminder lines never wrap. The list scrolls vertically when there are more reminders than fit, and horizontally when a line is wider than the card. The acknowledge icons stay pinned to the right edge while scrolling sideways.

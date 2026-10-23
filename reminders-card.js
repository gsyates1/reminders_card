/**
 * Reminders Card
 *
 * A Home Assistant Lovelace card that lists the reminders held in the
 * `reminders` attribute of a sensor and lets the user acknowledge them.
 *
 * The attribute is a dictionary of unique_id -> reminder text. Acknowledging
 * fires the `acknowledge_reminder` event (with `unique_id`) or the
 * `acknowledge_all` event; the sensor is expected to drop the reminder(s),
 * after which the card re-renders from the new state.
 */

const CARD_VERSION = "1.0.0";
const ACK_ICON = "mdi:check-circle-outline";
const DEFAULT_LIST_HEIGHT = "250px";
// Reminders acknowledged from the card are hidden straight away. If the
// sensor still lists one after this long, it is shown again.
const PENDING_TIMEOUT_MS = 10000;

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

class RemindersCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._pending = new Map(); // unique_id -> timeout handle
    this._lastReminders = undefined;
  }

  static getConfigElement() {
    return document.createElement("reminders-card-editor");
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass.states).find(
      (id) => hass.states[id].attributes && "reminders" in hass.states[id].attributes
    );
    return { entity: entity || "" };
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = { ...config };
    this._lastReminders = undefined;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const reminders = this._getReminders();
    const serialized = JSON.stringify(reminders);
    // hass is set on every state change in HA; only redraw when our data changes.
    if (serialized === this._lastReminders && this.shadowRoot.childElementCount) {
      return;
    }
    this._lastReminders = serialized;
    this._clearSettledPending(reminders);
    this._render();
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return { columns: 6, rows: 5, min_rows: 3 };
  }

  _getReminders() {
    if (!this._hass || !this._config || !this._config.entity) {
      return null;
    }
    const stateObj = this._hass.states[this._config.entity];
    if (!stateObj) {
      return null;
    }
    const reminders = stateObj.attributes.reminders;
    if (!reminders || typeof reminders !== "object" || Array.isArray(reminders)) {
      return {};
    }
    return reminders;
  }

  _clearSettledPending(reminders) {
    for (const [id, handle] of this._pending) {
      if (!reminders || !(id in reminders)) {
        clearTimeout(handle);
        this._pending.delete(id);
      }
    }
  }

  _markPending(id) {
    clearTimeout(this._pending.get(id));
    this._pending.set(
      id,
      setTimeout(() => {
        this._pending.delete(id);
        this._render();
      }, PENDING_TIMEOUT_MS)
    );
  }

  async _fireEvent(eventType, eventData) {
    // The websocket fire_event command needs an admin user.
    await this._hass.callWS({
      type: "fire_event",
      event_type: eventType,
      ...(eventData ? { event_data: eventData } : {}),
    });
  }

  async _acknowledge(id) {
    this._markPending(id);
    this._render();
    try {
      await this._fireEvent("acknowledge_reminder", { unique_id: id });
    } catch (err) {
      this._failed(err, [id]);
    }
  }

  async _acknowledgeAll() {
    const ids = Object.keys(this._getReminders() || {});
    ids.forEach((id) => this._markPending(id));
    this._render();
    try {
      await this._fireEvent("acknowledge_all");
    } catch (err) {
      this._failed(err, ids);
    }
  }

  _failed(err, ids) {
    ids.forEach((id) => {
      clearTimeout(this._pending.get(id));
      this._pending.delete(id);
    });
    this._render();
    const message = (err && err.message) || String(err);
    this.dispatchEvent(
      new CustomEvent("hass-notification", {
        detail: { message: `Could not acknowledge reminder: ${message}` },
        bubbles: true,
        composed: true,
      })
    );
  }

  _render() {
    if (!this._config) {
      return;
    }
    const config = this._config;
    const reminders = this._getReminders();
    const listHeight = config.list_height || DEFAULT_LIST_HEIGHT;

    let body;
    if (!config.entity) {
      body = `<div class="message">Select a reminders sensor in the card settings.</div>`;
    } else if (reminders === null) {
      body = `<div class="message warning">Entity not available: ${escapeHtml(config.entity)}</div>`;
    } else {
      const visible = Object.entries(reminders).filter(([id]) => !this._pending.has(id));
      body = visible.length
        ? `<div class="rows">${visible
            .map(
              ([id, text]) => `
              <div class="row">
                <span class="text">${escapeHtml(text)}</span>
                <ha-icon-button class="ack" data-id="${escapeHtml(id)}" label="Acknowledge">
                  <ha-icon icon="${ACK_ICON}"></ha-icon>
                </ha-icon-button>
              </div>`
            )
            .join("")}</div>`
        : `<div class="message">No reminders</div>`;
    }

    const hasReminders = reminders && Object.keys(reminders).some((id) => !this._pending.has(id));

    const oldList = this.shadowRoot.querySelector(".list");
    const scroll = oldList ? [oldList.scrollTop, oldList.scrollLeft] : [0, 0];

    this.shadowRoot.innerHTML = `
      <style>${RemindersCard.styles}</style>
      <ha-card>
        ${config.title ? `<h1 class="card-header">${escapeHtml(config.title)}</h1>` : ""}
        <div class="content">
          <div class="list" style="height: ${escapeHtml(listHeight)}">${body}</div>
          <div class="footer">
            <button class="all" type="button" ${hasReminders ? "" : "disabled"}>
              <ha-icon icon="${ACK_ICON}"></ha-icon>
              <span>All</span>
            </button>
          </div>
        </div>
      </ha-card>
    `;

    const list = this.shadowRoot.querySelector(".list");
    [list.scrollTop, list.scrollLeft] = scroll;

    this.shadowRoot.querySelectorAll("ha-icon-button.ack").forEach((button) => {
      button.addEventListener("click", () => this._acknowledge(button.dataset.id));
    });
    this.shadowRoot
      .querySelector("button.all")
      .addEventListener("click", () => this._acknowledgeAll());
  }

  static get styles() {
    return `
      :host {
        display: block;
        height: 100%;
      }
      ha-card {
        height: 100%;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
      }
      .card-header {
        margin: 0;
        padding: 16px 16px 0;
        font-family: var(--ha-card-header-font-family, inherit);
        font-size: var(--ha-card-header-font-size, 24px);
        font-weight: normal;
        line-height: 40px;
        color: var(--ha-card-header-color, var(--primary-text-color));
      }
      .content {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
      }
      .list {
        flex: 1 1 auto;
        min-height: 48px;
        overflow: auto;
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-card-border-radius, 12px);
        box-sizing: border-box;
      }
      .rows {
        /* Widest line sets the width, so long lines scroll and icons stay aligned. */
        width: max-content;
        min-width: 100%;
        padding: 4px 0;
        box-sizing: border-box;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 4px 0 16px;
        min-height: 48px;
      }
      .text {
        flex: 1 1 auto;
        white-space: nowrap;
        color: var(--primary-text-color);
        font-size: var(--paper-font-body1_-_font-size, 16px);
      }
      .ack {
        flex: 0 0 auto;
        /* Keep the button in view while a long line is scrolled sideways. */
        position: sticky;
        right: 0;
        border-radius: 50%;
        background: var(--ha-card-background, var(--card-background-color, transparent));
        color: var(--secondary-text-color);
        --mdc-icon-button-size: 40px;
      }
      .ack:hover {
        color: var(--primary-color);
      }
      .message {
        padding: 16px;
        color: var(--secondary-text-color);
      }
      .message.warning {
        color: var(--error-color);
      }
      .footer {
        display: flex;
        justify-content: flex-end;
      }
      button.all {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 36px;
        padding: 0 18px 0 12px;
        border: none;
        border-radius: 18px;
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        font-family: inherit;
        font-size: 14px;
        font-weight: 500;
        letter-spacing: 0.0892857em;
        cursor: pointer;
        --mdc-icon-size: 20px;
      }
      button.all:hover {
        filter: brightness(1.1);
      }
      button.all:focus-visible {
        outline: 2px solid var(--primary-text-color);
        outline-offset: 2px;
      }
      button.all:disabled {
        opacity: 0.5;
        cursor: default;
        filter: none;
      }
    `;
  }
}

class RemindersCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) {
      this._form.hass = hass;
    }
  }

  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.schema = [
        { name: "entity", required: true, selector: { entity: { domain: "sensor" } } },
        { name: "title", selector: { text: {} } },
        { name: "list_height", selector: { text: {} } },
      ];
      this._form.computeLabel = (schema) =>
        ({
          entity: "Reminders sensor",
          title: "Title (optional)",
          list_height: `List height (optional, default ${DEFAULT_LIST_HEIGHT})`,
        })[schema.name];
      this._form.addEventListener("value-changed", (ev) => {
        const config = { ...ev.detail.value };
        Object.keys(config).forEach((key) => {
          if (config[key] === "" || config[key] === undefined) {
            delete config[key];
          }
        });
        this._config = config;
        this.dispatchEvent(
          new CustomEvent("config-changed", {
            detail: { config },
            bubbles: true,
            composed: true,
          })
        );
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
  }
}

customElements.define("reminders-card", RemindersCard);
customElements.define("reminders-card-editor", RemindersCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "reminders-card",
  name: "Reminders Card",
  description: "Shows reminders from a sensor and lets you acknowledge them.",
  preview: true,
});

console.info(`%c REMINDERS-CARD %c ${CARD_VERSION} `, "color: white; background: #03a9f4; font-weight: 700;", "");

"""Config flow for OurGroceries Kiosk integration."""

import logging

import voluptuous as vol
from homeassistant import config_entries

from .api import OurGroceriesAPI
from .const import CONF_PASSWORD, CONF_USERNAME, DOMAIN

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_USERNAME): str,
        vol.Required(CONF_PASSWORD): str,
    }
)


class OurGroceriesKioskConfigFlow(
    config_entries.ConfigFlow, domain=DOMAIN
):
    """Handle a config flow for OurGroceries Kiosk."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step: username + password."""
        errors = {}

        if user_input is not None:
            api = OurGroceriesAPI(
                user_input[CONF_USERNAME], user_input[CONF_PASSWORD]
            )
            try:
                await api.validate_credentials()
            except Exception:
                _LOGGER.exception("Failed to authenticate with OurGroceries")
                errors["base"] = "invalid_auth"
            else:
                # Prevent duplicate entries
                await self.async_set_unique_id(user_input[CONF_USERNAME])
                self._abort_if_unique_id_configured()

                return self.async_create_entry(
                    title=f"OurGroceries ({user_input[CONF_USERNAME]})",
                    data=user_input,
                )

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
        )

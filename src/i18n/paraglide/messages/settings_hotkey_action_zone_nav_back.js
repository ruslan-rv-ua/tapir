/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Hotkey_Action_Zone_Nav_BackInputs */

const uk_settings_hotkey_action_zone_nav_back = /** @type {(inputs: Settings_Hotkey_Action_Zone_Nav_BackInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Навігація по зонах (назад)`)
};

const en_settings_hotkey_action_zone_nav_back = /** @type {(inputs: Settings_Hotkey_Action_Zone_Nav_BackInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Zone navigation (back)`)
};

/**
* | output |
* | --- |
* | "Zone navigation (back)" |
*
* @param {Settings_Hotkey_Action_Zone_Nav_BackInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_action_zone_nav_back = /** @type {((inputs?: Settings_Hotkey_Action_Zone_Nav_BackInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_Action_Zone_Nav_BackInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_action_zone_nav_back(inputs)
	return en_settings_hotkey_action_zone_nav_back(inputs)
});
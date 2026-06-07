/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Hotkey_Action_Zone_NavInputs */

const uk_settings_hotkey_action_zone_nav = /** @type {(inputs: Settings_Hotkey_Action_Zone_NavInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Навігація по зонах`)
};

const en_settings_hotkey_action_zone_nav = /** @type {(inputs: Settings_Hotkey_Action_Zone_NavInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Zone navigation`)
};

/**
* | output |
* | --- |
* | "Zone navigation" |
*
* @param {Settings_Hotkey_Action_Zone_NavInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_action_zone_nav = /** @type {((inputs?: Settings_Hotkey_Action_Zone_NavInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_Action_Zone_NavInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_action_zone_nav(inputs)
	return en_settings_hotkey_action_zone_nav(inputs)
});
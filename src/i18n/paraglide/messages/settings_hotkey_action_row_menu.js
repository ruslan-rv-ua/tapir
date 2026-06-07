/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Hotkey_Action_Row_MenuInputs */

const uk_settings_hotkey_action_row_menu = /** @type {(inputs: Settings_Hotkey_Action_Row_MenuInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Меню рядка`)
};

const en_settings_hotkey_action_row_menu = /** @type {(inputs: Settings_Hotkey_Action_Row_MenuInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Row menu`)
};

/**
* | output |
* | --- |
* | "Row menu" |
*
* @param {Settings_Hotkey_Action_Row_MenuInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_hotkey_action_row_menu = /** @type {((inputs?: Settings_Hotkey_Action_Row_MenuInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Hotkey_Action_Row_MenuInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_hotkey_action_row_menu(inputs)
	return en_settings_hotkey_action_row_menu(inputs)
});
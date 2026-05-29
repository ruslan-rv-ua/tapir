/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Minimize_To_TrayInputs */

const uk_settings_minimize_to_tray = /** @type {(inputs: Settings_Minimize_To_TrayInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Згортати до tray замість закриття`)
};

const en_settings_minimize_to_tray = /** @type {(inputs: Settings_Minimize_To_TrayInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Minimize to tray instead of closing`)
};

/**
* | output |
* | --- |
* | "Minimize to tray instead of closing" |
*
* @param {Settings_Minimize_To_TrayInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_minimize_to_tray = /** @type {((inputs?: Settings_Minimize_To_TrayInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Minimize_To_TrayInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_minimize_to_tray(inputs)
	return en_settings_minimize_to_tray(inputs)
});
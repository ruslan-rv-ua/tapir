/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Tab_GeneralInputs */

const uk_settings_tab_general = /** @type {(inputs: Settings_Tab_GeneralInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Загальні`)
};

const en_settings_tab_general = /** @type {(inputs: Settings_Tab_GeneralInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`General`)
};

/**
* | output |
* | --- |
* | "General" |
*
* @param {Settings_Tab_GeneralInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_tab_general = /** @type {((inputs?: Settings_Tab_GeneralInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Tab_GeneralInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_tab_general(inputs)
	return en_settings_tab_general(inputs)
});
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Double_Click_ActionInputs */

const uk_settings_double_click_action = /** @type {(inputs: Settings_Double_Click_ActionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Дія при подвійному кліку на потоці`)
};

const en_settings_double_click_action = /** @type {(inputs: Settings_Double_Click_ActionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Action on double-click on stream`)
};

/**
* | output |
* | --- |
* | "Action on double-click on stream" |
*
* @param {Settings_Double_Click_ActionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_double_click_action = /** @type {((inputs?: Settings_Double_Click_ActionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Double_Click_ActionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_double_click_action(inputs)
	return en_settings_double_click_action(inputs)
});
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Double_Click_RecordInputs */

const uk_settings_double_click_record = /** @type {(inputs: Settings_Double_Click_RecordInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Запис`)
};

const en_settings_double_click_record = /** @type {(inputs: Settings_Double_Click_RecordInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Record`)
};

/**
* | output |
* | --- |
* | "Record" |
*
* @param {Settings_Double_Click_RecordInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_double_click_record = /** @type {((inputs?: Settings_Double_Click_RecordInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Double_Click_RecordInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_double_click_record(inputs)
	return en_settings_double_click_record(inputs)
});
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Auto_Correct_CaseInputs */

const uk_settings_auto_correct_case = /** @type {(inputs: Settings_Auto_Correct_CaseInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Автокорекція регістру`)
};

const en_settings_auto_correct_case = /** @type {(inputs: Settings_Auto_Correct_CaseInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Auto-correct case`)
};

/**
* | output |
* | --- |
* | "Auto-correct case" |
*
* @param {Settings_Auto_Correct_CaseInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_auto_correct_case = /** @type {((inputs?: Settings_Auto_Correct_CaseInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Auto_Correct_CaseInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_auto_correct_case(inputs)
	return en_settings_auto_correct_case(inputs)
});
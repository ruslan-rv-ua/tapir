/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Backoff_Multiplier_DescInputs */

const uk_settings_backoff_multiplier_desc = /** @type {(inputs: Settings_Backoff_Multiplier_DescInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Множить інтервал після кожної невдалої спроби`)
};

const en_settings_backoff_multiplier_desc = /** @type {(inputs: Settings_Backoff_Multiplier_DescInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Multiplies the interval after each failed attempt`)
};

/**
* | output |
* | --- |
* | "Multiplies the interval after each failed attempt" |
*
* @param {Settings_Backoff_Multiplier_DescInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_backoff_multiplier_desc = /** @type {((inputs?: Settings_Backoff_Multiplier_DescInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Backoff_Multiplier_DescInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_backoff_multiplier_desc(inputs)
	return en_settings_backoff_multiplier_desc(inputs)
});
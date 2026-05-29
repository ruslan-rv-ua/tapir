/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Max_Retries_DescInputs */

const uk_settings_max_retries_desc = /** @type {(inputs: Settings_Max_Retries_DescInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`0 = необмежено`)
};

const en_settings_max_retries_desc = /** @type {(inputs: Settings_Max_Retries_DescInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`0 = unlimited`)
};

/**
* | output |
* | --- |
* | "0 = unlimited" |
*
* @param {Settings_Max_Retries_DescInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_max_retries_desc = /** @type {((inputs?: Settings_Max_Retries_DescInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Max_Retries_DescInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_max_retries_desc(inputs)
	return en_settings_max_retries_desc(inputs)
});
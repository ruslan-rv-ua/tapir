/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Max_Interval_DescInputs */

const uk_settings_max_interval_desc = /** @type {(inputs: Settings_Max_Interval_DescInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Верхня межа інтервалу між спробами`)
};

const en_settings_max_interval_desc = /** @type {(inputs: Settings_Max_Interval_DescInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Upper limit for the interval between attempts`)
};

/**
* | output |
* | --- |
* | "Upper limit for the interval between attempts" |
*
* @param {Settings_Max_Interval_DescInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_max_interval_desc = /** @type {((inputs?: Settings_Max_Interval_DescInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Max_Interval_DescInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_max_interval_desc(inputs)
	return en_settings_max_interval_desc(inputs)
});
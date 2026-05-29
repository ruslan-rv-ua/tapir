/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Retry_Interval_DescInputs */

const uk_settings_retry_interval_desc = /** @type {(inputs: Settings_Retry_Interval_DescInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Початковий час очікування між спробами перепідключення`)
};

const en_settings_retry_interval_desc = /** @type {(inputs: Settings_Retry_Interval_DescInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Initial wait time between reconnection attempts`)
};

/**
* | output |
* | --- |
* | "Initial wait time between reconnection attempts" |
*
* @param {Settings_Retry_Interval_DescInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_retry_interval_desc = /** @type {((inputs?: Settings_Retry_Interval_DescInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Retry_Interval_DescInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_retry_interval_desc(inputs)
	return en_settings_retry_interval_desc(inputs)
});
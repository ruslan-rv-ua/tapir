/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Retry_IntervalInputs */

const uk_settings_retry_interval = /** @type {(inputs: Settings_Retry_IntervalInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Інтервал між спробами (сек)`)
};

const en_settings_retry_interval = /** @type {(inputs: Settings_Retry_IntervalInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Retry interval (sec)`)
};

/**
* | output |
* | --- |
* | "Retry interval (sec)" |
*
* @param {Settings_Retry_IntervalInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_retry_interval = /** @type {((inputs?: Settings_Retry_IntervalInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Retry_IntervalInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_retry_interval(inputs)
	return en_settings_retry_interval(inputs)
});
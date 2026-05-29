/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Max_IntervalInputs */

const uk_settings_max_interval = /** @type {(inputs: Settings_Max_IntervalInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Максимальний інтервал (сек)`)
};

const en_settings_max_interval = /** @type {(inputs: Settings_Max_IntervalInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Max interval (sec)`)
};

/**
* | output |
* | --- |
* | "Max interval (sec)" |
*
* @param {Settings_Max_IntervalInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_max_interval = /** @type {((inputs?: Settings_Max_IntervalInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Max_IntervalInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_max_interval(inputs)
	return en_settings_max_interval(inputs)
});
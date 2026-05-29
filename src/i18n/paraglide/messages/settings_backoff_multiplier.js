/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Backoff_MultiplierInputs */

const uk_settings_backoff_multiplier = /** @type {(inputs: Settings_Backoff_MultiplierInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Множник backoff`)
};

const en_settings_backoff_multiplier = /** @type {(inputs: Settings_Backoff_MultiplierInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Backoff multiplier`)
};

/**
* | output |
* | --- |
* | "Backoff multiplier" |
*
* @param {Settings_Backoff_MultiplierInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_backoff_multiplier = /** @type {((inputs?: Settings_Backoff_MultiplierInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Backoff_MultiplierInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_backoff_multiplier(inputs)
	return en_settings_backoff_multiplier(inputs)
});
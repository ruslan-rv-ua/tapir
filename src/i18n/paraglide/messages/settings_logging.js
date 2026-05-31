/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_LoggingInputs */

const uk_settings_logging = /** @type {(inputs: Settings_LoggingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Логування`)
};

const en_settings_logging = /** @type {(inputs: Settings_LoggingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Logging`)
};

/**
* | output |
* | --- |
* | "Logging" |
*
* @param {Settings_LoggingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_logging = /** @type {((inputs?: Settings_LoggingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_LoggingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_logging(inputs)
	return en_settings_logging(inputs)
});
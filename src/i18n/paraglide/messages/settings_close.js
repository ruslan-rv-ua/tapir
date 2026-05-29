/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_CloseInputs */

const uk_settings_close = /** @type {(inputs: Settings_CloseInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Закрити налаштування`)
};

const en_settings_close = /** @type {(inputs: Settings_CloseInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Close settings`)
};

/**
* | output |
* | --- |
* | "Close settings" |
*
* @param {Settings_CloseInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_close = /** @type {((inputs?: Settings_CloseInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_CloseInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_close(inputs)
	return en_settings_close(inputs)
});
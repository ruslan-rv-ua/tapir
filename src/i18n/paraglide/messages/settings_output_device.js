/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Output_DeviceInputs */

const uk_settings_output_device = /** @type {(inputs: Settings_Output_DeviceInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Пристрій виведення`)
};

const en_settings_output_device = /** @type {(inputs: Settings_Output_DeviceInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Output device`)
};

/**
* | output |
* | --- |
* | "Output device" |
*
* @param {Settings_Output_DeviceInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_output_device = /** @type {((inputs?: Settings_Output_DeviceInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Output_DeviceInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_output_device(inputs)
	return en_settings_output_device(inputs)
});
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Output_Device_DefaultInputs */

const uk_settings_output_device_default = /** @type {(inputs: Settings_Output_Device_DefaultInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Системний за замовчуванням`)
};

const en_settings_output_device_default = /** @type {(inputs: Settings_Output_Device_DefaultInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`System default`)
};

/**
* | output |
* | --- |
* | "System default" |
*
* @param {Settings_Output_Device_DefaultInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_output_device_default = /** @type {((inputs?: Settings_Output_Device_DefaultInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Output_Device_DefaultInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_output_device_default(inputs)
	return en_settings_output_device_default(inputs)
});
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Output_DirInputs */

const uk_settings_output_dir = /** @type {(inputs: Settings_Output_DirInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Папка для записів`)
};

const en_settings_output_dir = /** @type {(inputs: Settings_Output_DirInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Recording folder`)
};

/**
* | output |
* | --- |
* | "Recording folder" |
*
* @param {Settings_Output_DirInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_output_dir = /** @type {((inputs?: Settings_Output_DirInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Output_DirInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_output_dir(inputs)
	return en_settings_output_dir(inputs)
});
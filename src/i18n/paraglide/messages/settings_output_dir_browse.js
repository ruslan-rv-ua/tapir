/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Output_Dir_BrowseInputs */

const uk_settings_output_dir_browse = /** @type {(inputs: Settings_Output_Dir_BrowseInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Огляд`)
};

const en_settings_output_dir_browse = /** @type {(inputs: Settings_Output_Dir_BrowseInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Browse`)
};

/**
* | output |
* | --- |
* | "Browse" |
*
* @param {Settings_Output_Dir_BrowseInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_output_dir_browse = /** @type {((inputs?: Settings_Output_Dir_BrowseInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Output_Dir_BrowseInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_output_dir_browse(inputs)
	return en_settings_output_dir_browse(inputs)
});
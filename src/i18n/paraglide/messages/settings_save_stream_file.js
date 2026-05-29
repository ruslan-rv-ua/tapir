/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Save_Stream_FileInputs */

const uk_settings_save_stream_file = /** @type {(inputs: Settings_Save_Stream_FileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Зберігати файл потоку`)
};

const en_settings_save_stream_file = /** @type {(inputs: Settings_Save_Stream_FileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Save stream file`)
};

/**
* | output |
* | --- |
* | "Save stream file" |
*
* @param {Settings_Save_Stream_FileInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_save_stream_file = /** @type {((inputs?: Settings_Save_Stream_FileInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Save_Stream_FileInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_save_stream_file(inputs)
	return en_settings_save_stream_file(inputs)
});
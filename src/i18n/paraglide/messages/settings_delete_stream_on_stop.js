/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Delete_Stream_On_StopInputs */

const uk_settings_delete_stream_on_stop = /** @type {(inputs: Settings_Delete_Stream_On_StopInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Видаляти файл потоку після зупинки`)
};

const en_settings_delete_stream_on_stop = /** @type {(inputs: Settings_Delete_Stream_On_StopInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Delete stream file on stop`)
};

/**
* | output |
* | --- |
* | "Delete stream file on stop" |
*
* @param {Settings_Delete_Stream_On_StopInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_delete_stream_on_stop = /** @type {((inputs?: Settings_Delete_Stream_On_StopInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Delete_Stream_On_StopInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_delete_stream_on_stop(inputs)
	return en_settings_delete_stream_on_stop(inputs)
});
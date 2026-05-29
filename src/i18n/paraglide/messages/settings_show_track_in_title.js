/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Show_Track_In_TitleInputs */

const uk_settings_show_track_in_title = /** @type {(inputs: Settings_Show_Track_In_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Показувати назву треку в заголовку вікна`)
};

const en_settings_show_track_in_title = /** @type {(inputs: Settings_Show_Track_In_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Show track name in window title`)
};

/**
* | output |
* | --- |
* | "Show track name in window title" |
*
* @param {Settings_Show_Track_In_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_show_track_in_title = /** @type {((inputs?: Settings_Show_Track_In_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Show_Track_In_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_show_track_in_title(inputs)
	return en_settings_show_track_in_title(inputs)
});
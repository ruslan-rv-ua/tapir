/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Confirm_Stop_All_TitleInputs */

const uk_confirm_stop_all_title = /** @type {(inputs: Confirm_Stop_All_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Зупинити всі записи?`)
};

const en_confirm_stop_all_title = /** @type {(inputs: Confirm_Stop_All_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Stop all recordings?`)
};

/**
* | output |
* | --- |
* | "Stop all recordings?" |
*
* @param {Confirm_Stop_All_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const confirm_stop_all_title = /** @type {((inputs?: Confirm_Stop_All_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Confirm_Stop_All_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_confirm_stop_all_title(inputs)
	return en_confirm_stop_all_title(inputs)
});
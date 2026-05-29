/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Status_ErrorInputs */

const uk_status_error = /** @type {(inputs: Status_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Помилка`)
};

const en_status_error = /** @type {(inputs: Status_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Error`)
};

/**
* | output |
* | --- |
* | "Error" |
*
* @param {Status_ErrorInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const status_error = /** @type {((inputs?: Status_ErrorInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Status_ErrorInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_status_error(inputs)
	return en_status_error(inputs)
});
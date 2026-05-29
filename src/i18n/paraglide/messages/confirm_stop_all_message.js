/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Confirm_Stop_All_MessageInputs */

const uk_confirm_stop_all_message = /** @type {(inputs: Confirm_Stop_All_MessageInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Буде зупинено ${i?.count} активних записів.`)
};

const en_confirm_stop_all_message = /** @type {(inputs: Confirm_Stop_All_MessageInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`${i?.count} active recordings will be stopped.`)
};

/**
* | output |
* | --- |
* | "{count} active recordings will be stopped." |
*
* @param {Confirm_Stop_All_MessageInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const confirm_stop_all_message = /** @type {((inputs: Confirm_Stop_All_MessageInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Confirm_Stop_All_MessageInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_confirm_stop_all_message(inputs)
	return en_confirm_stop_all_message(inputs)
});